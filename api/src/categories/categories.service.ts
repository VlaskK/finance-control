import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq, or, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import {
  budgets,
  categories,
  labelMap,
  recurringItems,
  transactions,
  type Category,
} from '../database/schema';
import type { CreateCategoryDto, MergeCategoryDto, UpdateCategoryDto } from '../common/schemas';

export interface CategoryNode extends Category {
  children: Category[];
}

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // FR-C1 — дерево категорий по типам. Архивные включаются (нужны аналитике, BR-3),
  // фронт сам скрывает их на экране ввода.
  async tree(): Promise<CategoryNode[]> {
    const all = await this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    const roots = all.filter((c) => c.parentId === null);
    return roots.map((root) => ({
      ...root,
      children: all.filter((c) => c.parentId === root.id),
    }));
  }

  async findOne(id: string): Promise<Category> {
    const [row] = await this.db.select().from(categories).where(eq(categories.id, id));
    if (!row) throw new NotFoundException('Категория не найдена');
    return row;
  }

  // FR-C1 — создание категории/подкатегории
  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) {
      const parent = await this.findOne(dto.parentId);
      if (parent.parentId) {
        // D-2 — дерево двухуровневое
        throw new BadRequestException('Подкатегория не может иметь своих подкатегорий');
      }
    }
    const [row] = await this.db
      .insert(categories)
      .values({
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId ?? null,
        description: dto.description ?? null,
        color: dto.color ?? '#888888',
        icon: dto.icon ?? null,
      })
      .returning();
    return row;
  }

  // FR-C2 (переименование, BR-2 — безопасно) / FR-C3 (архив, BR-3)
  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);
    const [row] = await this.db
      .update(categories)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      })
      .where(eq(categories.id, id))
      .returning();

    // BR-11 — каскадный архив подкатегорий при архивировании родителя
    if (dto.active === false) {
      await this.db
        .update(categories)
        .set({ active: false })
        .where(eq(categories.parentId, id));
    }
    return row;
  }

  // FR-C4 / BR-5 — слияние: операции переезжают на целевую, исходная архивируется
  async merge(sourceId: string, dto: MergeCategoryDto) {
    const { targetId } = dto;
    if (sourceId === targetId) {
      throw new BadRequestException('Выберите другую целевую категорию');
    }
    const source = await this.findOne(sourceId);
    const target = await this.findOne(targetId);
    if (target.parentId === sourceId) {
      throw new BadRequestException('Нельзя слить категорию в её собственную подкатегорию');
    }
    if (source.type !== target.type) {
      throw new BadRequestException('Слияние возможно только внутри одного типа операций');
    }

    // лист→лист и лист→родитель (BR-5): вычисляем итоговую пару категория/подкатегория
    const rootTargetId = target.parentId ?? target.id;
    const subTargetId = target.parentId ? target.id : null;

    await this.db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({ categoryId: rootTargetId, subcategoryId: subTargetId })
        .where(
          or(eq(transactions.categoryId, sourceId), eq(transactions.subcategoryId, sourceId)),
        );

      // BR-7 — выученные метки следуют за операциями
      await tx
        .update(labelMap)
        .set({ categoryId: rootTargetId, subcategoryId: subTargetId })
        .where(or(eq(labelMap.categoryId, sourceId), eq(labelMap.subcategoryId, sourceId)));

      await tx
        .update(recurringItems)
        .set({ categoryId: targetId })
        .where(eq(recurringItems.categoryId, sourceId));

      // бюджет исходной переносится, только если у целевой его нет
      const [targetBudget] = await tx
        .select()
        .from(budgets)
        .where(eq(budgets.categoryId, targetId));
      if (targetBudget) {
        await tx.delete(budgets).where(eq(budgets.categoryId, sourceId));
      } else {
        await tx
          .update(budgets)
          .set({ categoryId: targetId })
          .where(eq(budgets.categoryId, sourceId));
      }

      // BR-3 + BR-11 — исходная и её подкатегории в архив
      await tx
        .update(categories)
        .set({ active: false })
        .where(or(eq(categories.id, sourceId), eq(categories.parentId, sourceId)));
    });

    return { merged: true, sourceId, targetId };
  }

  // BR-4 — физическое удаление только пустых категорий
  async remove(id: string) {
    await this.findOne(id);
    const [usage] = await this.db
      .select({
        txCount: sql<number>`(select count(*)::int from ${transactions} t
          where t.category_id = ${id} or t.subcategory_id = ${id})`,
        childCount: sql<number>`(select count(*)::int from ${categories} c
          where c.parent_id = ${id})`,
      })
      .from(sql`(select 1) as one`);

    if (usage.txCount > 0 || usage.childCount > 0) {
      throw new ConflictException(
        'Категория используется — заархивируйте её или слейте с другой',
      );
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(budgets).where(eq(budgets.categoryId, id));
      await tx
        .delete(labelMap)
        .where(or(eq(labelMap.categoryId, id), eq(labelMap.subcategoryId, id)));
      await tx.delete(categories).where(eq(categories.id, id));
    });
    return { deleted: true };
  }
}
