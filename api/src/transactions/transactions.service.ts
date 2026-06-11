import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Database } from '../database/database.module';
import {
  categories,
  labelMap,
  recurringItems,
  tags,
  transactionTags,
  transactions,
} from '../database/schema';
import type {
  CreateTransactionDto,
  ListTransactionsDto,
  UpdateTransactionDto,
} from '../common/schemas';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class TransactionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // FR-A1 — создание операции. Тип берётся от категории (BR-10 опирается на него).
  async create(dto: CreateTransactionDto) {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, dto.categoryId));
    if (!category) throw new NotFoundException('Категория не найдена');

    // BR-12 — если метка совпадает с именем регулярной позиции, связываем автоматически
    let recurringId = dto.recurringId ?? null;
    if (!recurringId && dto.label) {
      const [match] = await this.db
        .select({ id: recurringItems.id })
        .from(recurringItems)
        .where(sql`lower(${recurringItems.name}) = lower(${dto.label})`);
      recurringId = match?.id ?? null;
    }

    const [row] = await this.db
      .insert(transactions)
      .values({
        amount: dto.amount.toFixed(2),
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId ?? null,
        occurredAt: dto.occurredAt ?? today(),
        label: dto.label || null,
        note: dto.note || null,
        currency: dto.currency ?? 'RUB',
        recurringId,
      })
      .returning();

    if (dto.tagIds?.length) await this.setTags(row.id, dto.tagIds);

    // BR-7 — обучаемый автовыбор: запоминаем связку метка → (категория, подкатегория)
    if (dto.label) {
      await this.rememberLabel(dto.label, dto.categoryId, dto.subcategoryId ?? null);
    }
    return this.findOne(row.id);
  }

  // FR-B1 / FR-B4 / FR-B5 — список с фильтрами, новые сверху
  async list(filters: ListTransactionsDto) {
    const conditions: SQL[] = [];
    if (filters.categoryId) {
      // фильтр по категории захватывает и операции её подкатегорий
      conditions.push(
        sql`(${transactions.categoryId} = ${filters.categoryId} or ${transactions.subcategoryId} = ${filters.categoryId})`,
      );
    }
    if (filters.from) conditions.push(gte(transactions.occurredAt, filters.from));
    if (filters.to) conditions.push(lte(transactions.occurredAt, filters.to));
    if (filters.type) conditions.push(eq(categories.type, filters.type));
    if (filters.q) conditions.push(ilike(transactions.label, `%${filters.q}%`));
    if (filters.tagId) {
      conditions.push(
        sql`exists (select 1 from ${transactionTags} tt
            where tt.transaction_id = ${transactions.id} and tt.tag_id = ${filters.tagId})`,
      );
    }

    return this.query(conditions);
  }

  async findOne(id: string) {
    const [row] = await this.query([eq(transactions.id, id)]);
    if (!row) throw new NotFoundException('Операция не найдена');
    return row;
  }

  private async query(conditions: SQL[]) {
    const sub = alias(categories, 'sub');
    const rows = await this.db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        occurredAt: transactions.occurredAt,
        currency: transactions.currency,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        type: categories.type,
        subcategoryId: transactions.subcategoryId,
        subcategoryName: sub.name,
        label: transactions.label,
        note: transactions.note,
        recurringId: transactions.recurringId,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(sub, eq(transactions.subcategoryId, sub.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));

    return this.attachTags(rows);
  }

  // FR-B2 — редактирование любого поля; отчёты пересчитываются сами (агрегаты на чтении)
  async update(id: string, dto: UpdateTransactionDto) {
    await this.ensureExists(id);
    const [row] = await this.db
      .update(transactions)
      .set({
        ...(dto.amount !== undefined && { amount: dto.amount.toFixed(2) }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.subcategoryId !== undefined && { subcategoryId: dto.subcategoryId }),
        ...(dto.occurredAt !== undefined && { occurredAt: dto.occurredAt }),
        ...(dto.label !== undefined && { label: dto.label || null }),
        ...(dto.note !== undefined && { note: dto.note || null }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.recurringId !== undefined && { recurringId: dto.recurringId }),
      })
      .where(eq(transactions.id, id))
      .returning();

    if (dto.tagIds !== undefined) await this.setTags(id, dto.tagIds);

    // BR-7 — ручной выбор категории при известной метке тоже обучает связку
    if (row.label && (dto.categoryId !== undefined || dto.subcategoryId !== undefined)) {
      await this.rememberLabel(row.label, row.categoryId, row.subcategoryId);
    }
    return this.findOne(id);
  }

  // FR-B3 — удаление (подтверждение запрашивает фронт)
  async remove(id: string) {
    await this.ensureExists(id);
    await this.db.delete(transactions).where(eq(transactions.id, id));
    return { deleted: true };
  }

  // FR-A4 / BR-7 — автодополнение метки с предзаполнением категории
  async suggestLabels(q: string) {
    return this.db
      .select()
      .from(labelMap)
      .where(ilike(labelMap.label, `${q}%`))
      .orderBy(desc(labelMap.updatedAt))
      .limit(10);
  }

  private async ensureExists(id: string) {
    const [row] = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.id, id));
    if (!row) throw new NotFoundException('Операция не найдена');
  }

  private async setTags(transactionId: string, tagIds: string[]) {
    await this.db
      .delete(transactionTags)
      .where(eq(transactionTags.transactionId, transactionId));
    if (tagIds.length) {
      await this.db
        .insert(transactionTags)
        .values(tagIds.map((tagId) => ({ transactionId, tagId })))
        .onConflictDoNothing();
    }
  }

  private async attachTags<T extends { id: string }>(rows: T[]) {
    if (!rows.length) return rows.map((r) => ({ ...r, tags: [] as { id: string; name: string }[] }));
    const links = await this.db
      .select({
        transactionId: transactionTags.transactionId,
        id: tags.id,
        name: tags.name,
      })
      .from(transactionTags)
      .innerJoin(tags, eq(transactionTags.tagId, tags.id))
      .where(inArray(transactionTags.transactionId, rows.map((r) => r.id)));

    const byTx = new Map<string, { id: string; name: string }[]>();
    for (const link of links) {
      const list = byTx.get(link.transactionId) ?? [];
      list.push({ id: link.id, name: link.name });
      byTx.set(link.transactionId, list);
    }
    return rows.map((r) => ({ ...r, tags: byTx.get(r.id) ?? [] }));
  }

  private async rememberLabel(
    label: string,
    categoryId: string,
    subcategoryId: string | null,
  ) {
    await this.db
      .insert(labelMap)
      .values({ label, categoryId, subcategoryId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: labelMap.label,
        set: { categoryId, subcategoryId, updatedAt: new Date() },
      });
  }
}
