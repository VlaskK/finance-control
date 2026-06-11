import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { categories, recurringItems, transactions } from '../database/schema';
import type { CreateRecurringDto, UpdateRecurringDto } from '../common/schemas';

// BR-12 — регулярные позиции; только is_fixed_price участвуют в индексе инфляции (CALC-6)
@Injectable()
export class RecurringService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list() {
    return this.db
      .select({
        id: recurringItems.id,
        name: recurringItems.name,
        categoryId: recurringItems.categoryId,
        categoryName: categories.name,
        isFixedPrice: recurringItems.isFixedPrice,
        txCount: sql<number>`(select count(*)::int from ${transactions} t where t.recurring_id = ${recurringItems.id})`,
      })
      .from(recurringItems)
      .innerJoin(categories, eq(recurringItems.categoryId, categories.id))
      .orderBy(asc(recurringItems.name));
  }

  async create(dto: CreateRecurringDto) {
    const [row] = await this.db
      .insert(recurringItems)
      .values({
        name: dto.name,
        categoryId: dto.categoryId,
        isFixedPrice: dto.isFixedPrice ?? false,
      })
      .returning();

    // Привязываем существующие операции с совпадающей меткой (выделение из меток, §3)
    await this.db
      .update(transactions)
      .set({ recurringId: row.id })
      .where(
        sql`${transactions.recurringId} is null and lower(${transactions.label}) = lower(${row.name})`,
      );
    return row;
  }

  async update(id: string, dto: UpdateRecurringDto) {
    await this.ensureExists(id);
    const [row] = await this.db
      .update(recurringItems)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.isFixedPrice !== undefined && { isFixedPrice: dto.isFixedPrice }),
      })
      .where(eq(recurringItems.id, id))
      .returning();
    return row;
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // Операции не теряются: ссылка снимается, история остаётся
    await this.db
      .update(transactions)
      .set({ recurringId: null })
      .where(eq(transactions.recurringId, id));
    try {
      await this.db.delete(recurringItems).where(eq(recurringItems.id, id));
    } catch {
      throw new ConflictException('Позиция используется — попробуйте ещё раз');
    }
    return { deleted: true };
  }

  private async ensureExists(id: string) {
    const [row] = await this.db
      .select({ id: recurringItems.id })
      .from(recurringItems)
      .where(eq(recurringItems.id, id));
    if (!row) throw new NotFoundException('Регулярная позиция не найдена');
  }
}
