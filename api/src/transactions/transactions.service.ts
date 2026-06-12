import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Database } from '../database/database.module';
import {
  accounts,
  categories,
  labelMap,
  recurringItems,
  tags,
  transactionTags,
  transactions,
  type Account,
} from '../database/schema';
import { AccountsService } from '../accounts/accounts.service';
import { deriveMoney } from './money';
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
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly accounts: AccountsService,
  ) {}

  // FR-A1 — создание операции. Тип берётся от категории (BR-10 опирается на него),
  // валюта — от счёта списания; производные суммы выводит deriveMoney.
  async create(dto: CreateTransactionDto) {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, dto.categoryId));
    if (!category) throw new NotFoundException('Категория не найдена');

    const account = dto.accountId
      ? await this.accounts.findOne(dto.accountId)
      : await this.accounts.findDefault();
    const toAccount = await this.resolveToAccount(dto.toAccountId ?? null, account.id);

    const money = deriveMoney({
      amount: dto.amount,
      currency: account.currency,
      type: category.type,
      rate: dto.rate,
      toCurrency: toAccount?.currency ?? null,
      toAmount: dto.toAmount,
    });

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
        currency: account.currency,
        accountId: account.id,
        toAccountId: toAccount?.id ?? null,
        toAmount: money.toAmount,
        rate: money.rate,
        baseAmount: money.baseAmount,
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
    if (filters.accountId) {
      // история счёта включает и входящие на него переводы
      conditions.push(
        sql`(${transactions.accountId} = ${filters.accountId} or ${transactions.toAccountId} = ${filters.accountId})`,
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
    const toAcc = alias(accounts, 'to_acc');
    const rows = await this.db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        occurredAt: transactions.occurredAt,
        currency: transactions.currency,
        accountId: transactions.accountId,
        accountName: accounts.name,
        toAccountId: transactions.toAccountId,
        toAccountName: toAcc.name,
        toAmount: transactions.toAmount,
        toCurrency: toAcc.currency,
        rate: transactions.rate,
        baseAmount: transactions.baseAmount,
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
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(sub, eq(transactions.subcategoryId, sub.id))
      .leftJoin(toAcc, eq(transactions.toAccountId, toAcc.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));

    return this.attachTags(rows);
  }

  // FR-B2 — редактирование любого поля; отчёты пересчитываются сами (агрегаты на чтении).
  // Денежные поля не патчатся слепо: итоговое состояние пере-выводится через deriveMoney.
  async update(id: string, dto: UpdateTransactionDto) {
    const existing = await this.ensureExists(id);

    // Итоговые значения после слияния dto поверх существующей строки.
    const amount = dto.amount ?? Number(existing.amount);
    const categoryId = dto.categoryId ?? existing.categoryId;
    const accountId = dto.accountId ?? existing.accountId;
    const toAccountId =
      dto.toAccountId !== undefined ? dto.toAccountId : existing.toAccountId;

    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId));
    if (!category) throw new NotFoundException('Категория не найдена');

    const account = await this.accounts.findOne(accountId);
    // Тип ушёл от перевода — поля назначения обнуляются.
    const toAccount =
      category.type === 'transfer'
        ? await this.resolveToAccount(toAccountId, account.id)
        : null;

    const moneyChanged =
      dto.amount !== undefined ||
      dto.categoryId !== undefined ||
      dto.accountId !== undefined ||
      dto.toAccountId !== undefined ||
      dto.toAmount !== undefined ||
      dto.rate !== undefined;

    // Курс: новый из dto; при смене счёта старый курс не имеет смысла — требуем заново.
    const rate =
      dto.rate !== undefined
        ? dto.rate
        : dto.accountId !== undefined && dto.accountId !== existing.accountId
          ? null
          : existing.rate !== null
            ? Number(existing.rate)
            : null;
    // Сумма зачисления: явная из dto; если деньги не менялись — хранимая (она авторитетна).
    const toAmount =
      dto.toAmount !== undefined
        ? dto.toAmount
        : !moneyChanged && existing.toAmount !== null
          ? Number(existing.toAmount)
          : null;

    const money = moneyChanged
      ? deriveMoney({
          amount,
          currency: account.currency,
          type: category.type,
          rate,
          toCurrency: toAccount?.currency ?? null,
          toAmount,
        })
      : null;

    const [row] = await this.db
      .update(transactions)
      .set({
        ...(dto.amount !== undefined && { amount: dto.amount.toFixed(2) }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.subcategoryId !== undefined && { subcategoryId: dto.subcategoryId }),
        ...(dto.occurredAt !== undefined && { occurredAt: dto.occurredAt }),
        ...(dto.label !== undefined && { label: dto.label || null }),
        ...(dto.note !== undefined && { note: dto.note || null }),
        ...(dto.recurringId !== undefined && { recurringId: dto.recurringId }),
        ...(money && {
          accountId: account.id,
          currency: account.currency,
          toAccountId: toAccount?.id ?? null,
          toAmount: money.toAmount,
          rate: money.rate,
          baseAmount: money.baseAmount,
        }),
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
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));
    if (!row) throw new NotFoundException('Операция не найдена');
    return row;
  }

  // Счёт зачисления перевода: null допустим (перевод «вне счетов»), сам в себя — нельзя.
  private async resolveToAccount(
    toAccountId: string | null,
    accountId: string,
  ): Promise<Account | null> {
    if (!toAccountId) return null;
    if (toAccountId === accountId) {
      throw new BadRequestException('Счёт зачисления должен отличаться от счёта списания');
    }
    return this.accounts.findOne(toAccountId);
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
