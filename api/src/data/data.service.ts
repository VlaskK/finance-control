import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Database } from '../database/database.module';
import {
  budgets,
  categories,
  labelMap,
  recurringItems,
  tags,
  transactionTags,
  transactions,
} from '../database/schema';
import type { ImportCsvDto, ImportJsonDto } from '../common/schemas';
import { mapHeaders, parseAmount, parseCsv, parseDateCell, parseTypeCell, toCsv } from './csv';

@Injectable()
export class DataService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // FR-G1 — полный JSON-бэкап (формат принимает обратно restoreJson, FR-G3)
  async exportJson() {
    const [cats, txs, recurring, labels, allTags, txTags, allBudgets] = await Promise.all([
      this.db.select().from(categories).orderBy(asc(categories.sortOrder)),
      this.db.select().from(transactions).orderBy(asc(transactions.occurredAt)),
      this.db.select().from(recurringItems),
      this.db.select().from(labelMap),
      this.db.select().from(tags),
      this.db.select().from(transactionTags),
      this.db.select().from(budgets),
    ]);
    return {
      app: 'finflow',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: cats,
      transactions: txs,
      recurringItems: recurring,
      labelMap: labels,
      tags: allTags,
      transactionTags: txTags,
      budgets: allBudgets,
    };
  }

  // FR-G1 — операции в CSV (формат совместим с импортом FR-G2)
  async exportCsv(): Promise<string> {
    const sub = alias(categories, 'sub');
    const rows = await this.db
      .select({
        occurredAt: transactions.occurredAt,
        amount: transactions.amount,
        currency: transactions.currency,
        type: categories.type,
        category: categories.name,
        subcategory: sub.name,
        label: transactions.label,
        note: transactions.note,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(sub, eq(transactions.subcategoryId, sub.id))
      .orderBy(desc(transactions.occurredAt));

    return toCsv([
      ['date', 'amount', 'currency', 'type', 'category', 'subcategory', 'label', 'note'],
      ...rows.map((r) => [
        r.occurredAt,
        r.amount,
        r.currency,
        r.type,
        r.category,
        r.subcategory,
        r.label,
        r.note,
      ]),
    ]);
  }

  // FR-G2 — импорт истории из CSV. Неизвестные категории создаются на лету.
  // Валидные строки импортируются, проблемные возвращаются с номером и причиной.
  async importCsv(dto: ImportCsvDto) {
    const rows = parseCsv(dto.csv);
    if (rows.length < 2) {
      throw new BadRequestException(
        'Добавьте в файл строку заголовков и хотя бы одну операцию',
      );
    }
    const cols = mapHeaders(rows[0]);
    for (const required of ['date', 'amount', 'category'] as const) {
      if (cols[required] === undefined) {
        throw new BadRequestException(
          `Добавьте колонку «${required}» (date/дата, amount/сумма, category/категория)`,
        );
      }
    }

    const allCats = await this.db.select().from(categories);
    const catByKey = new Map(
      allCats.map((c) => [`${c.parentId ?? 'root'}|${c.name.trim().toLowerCase()}`, c]),
    );

    const resolveCategory = async (
      name: string,
      type: 'expense' | 'transfer' | 'income',
      parentId: string | null,
    ) => {
      const key = `${parentId ?? 'root'}|${name.trim().toLowerCase()}`;
      const existing = catByKey.get(key);
      if (existing) return existing;
      const [created] = await this.db
        .insert(categories)
        .values({ name: name.trim(), type, parentId, color: '#888888' })
        .returning();
      catByKey.set(key, created);
      return created;
    };

    const cell = (row: string[], key: string) =>
      cols[key] !== undefined ? (row[cols[key]] ?? '').trim() : '';

    let imported = 0;
    const skipped: { line: number; reason: string }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 1;
      const occurredAt = parseDateCell(cell(row, 'date'));
      const amount = parseAmount(cell(row, 'amount'));
      const categoryName = cell(row, 'category');

      if (!occurredAt) {
        skipped.push({ line, reason: 'Укажите дату в формате ГГГГ-ММ-ДД или ДД.ММ.ГГГГ' });
        continue;
      }
      if (amount === null || amount <= 0) {
        skipped.push({ line, reason: 'Укажите сумму больше нуля' });
        continue;
      }
      if (!categoryName) {
        skipped.push({ line, reason: 'Укажите категорию' });
        continue;
      }

      const type = parseTypeCell(cell(row, 'type')) ?? dto.defaultType;
      const parent = await resolveCategory(categoryName, type, null);
      const subName = cell(row, 'subcategory');
      const sub = subName ? await resolveCategory(subName, parent.type, parent.id) : null;

      await this.db.insert(transactions).values({
        occurredAt,
        amount: amount.toFixed(2),
        categoryId: parent.id,
        subcategoryId: sub?.id ?? null,
        label: cell(row, 'label') || null,
        note: cell(row, 'note') || null,
      });
      imported++;
    }

    return { imported, skipped };
  }

  // FR-G3 — восстановление из JSON-бэкапа: текущие данные полностью заменяются
  // (подтверждение запрашивает фронт)
  async restoreJson(dto: ImportJsonDto) {
    const d = dto.data;
    await this.db.transaction(async (tx) => {
      await tx.delete(transactionTags);
      await tx.delete(transactions);
      await tx.delete(labelMap);
      await tx.delete(budgets);
      await tx.delete(recurringItems);
      await tx.delete(tags);
      await tx.delete(categories);

      // родители раньше детей — FK на parent_id
      const cats = [...d.categories].sort((a, b) =>
        (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0),
      );
      for (const c of cats) {
        await tx.insert(categories).values({
          id: c.id,
          name: c.name,
          type: c.type,
          parentId: c.parentId ?? null,
          description: c.description ?? null,
          color: c.color ?? '#888888',
          icon: c.icon ?? null,
          sortOrder: c.sortOrder ?? 0,
          active: c.active ?? true,
        });
      }
      for (const r of d.recurringItems) {
        await tx.insert(recurringItems).values({
          id: r.id,
          name: r.name,
          categoryId: r.categoryId,
          isFixedPrice: r.isFixedPrice ?? false,
        });
      }
      for (const t of d.tags) {
        await tx.insert(tags).values({ id: t.id, name: t.name });
      }
      for (const t of d.transactions) {
        await tx.insert(transactions).values({
          id: t.id,
          occurredAt: t.occurredAt,
          amount: t.amount,
          currency: t.currency ?? 'RUB',
          categoryId: t.categoryId,
          subcategoryId: t.subcategoryId ?? null,
          label: t.label ?? null,
          recurringId: t.recurringId ?? null,
          note: t.note ?? null,
          createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        });
      }
      for (const link of d.transactionTags) {
        await tx.insert(transactionTags).values({
          transactionId: link.transactionId,
          tagId: link.tagId,
        });
      }
      for (const l of d.labelMap) {
        await tx.insert(labelMap).values({
          label: l.label,
          categoryId: l.categoryId,
          subcategoryId: l.subcategoryId ?? null,
          updatedAt: l.updatedAt ? new Date(l.updatedAt) : new Date(),
        });
      }
      for (const b of d.budgets) {
        await tx.insert(budgets).values({
          categoryId: b.categoryId,
          monthlyLimit: b.monthlyLimit,
        });
      }
    });

    return {
      restored: true,
      categories: d.categories.length,
      transactions: d.transactions.length,
    };
  }
}
