import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import {
  accountInterestRates,
  accounts,
  transactions,
  type Account,
  type AccountInterestRate,
} from '../database/schema';
import type { CreateAccountDto, SetRateDto, UpdateAccountDto } from '../common/schemas';

export interface AccountWithBalance extends Account {
  balance: number;
  currentRate: number | null; // годовых %, действующая сегодня
  currentRateFrom: string | null;
}

@Injectable()
export class AccountsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // Балансы в валюте самого счёта: начальный остаток + доходы − списания + входящие переводы.
  // Плюс действующая на сегодня ставка из истории.
  async list(): Promise<AccountWithBalance[]> {
    return (await this.db.execute(sql`
      select a.id, a.name, a.currency, a.is_default as "isDefault",
             a.initial_balance as "initialBalance", a.sort_order as "sortOrder",
             a.active, a.interest_accrued_thru as "interestAccruedThru", a.created_at as "createdAt",
             (a.initial_balance
               + coalesce((
                   select sum(case when c.type = 'income' then t.amount else -t.amount end)
                   from transactions t
                   join categories c on c.id = t.category_id
                   where t.account_id = a.id
                 ), 0)
               + coalesce((
                   select sum(t.to_amount) from transactions t
                   where t.to_account_id = a.id
                 ), 0)
             )::float8 as "balance",
             (select air.rate::float8 from account_interest_rates air
                where air.account_id = a.id and air.effective_from <= current_date
                order by air.effective_from desc limit 1) as "currentRate",
             (select air.effective_from from account_interest_rates air
                where air.account_id = a.id and air.effective_from <= current_date
                order by air.effective_from desc limit 1) as "currentRateFrom"
      from accounts a
      order by a.sort_order, a.name
    `)) as unknown as AccountWithBalance[];
  }

  // История ставок счёта (новые сверху)
  async listRates(accountId: string): Promise<AccountInterestRate[]> {
    await this.findOne(accountId);
    return this.db
      .select()
      .from(accountInterestRates)
      .where(eq(accountInterestRates.accountId, accountId))
      .orderBy(desc(accountInterestRates.effectiveFrom));
  }

  // Добавить ставку с датой вступления. Нельзя менять ставку у уже начисленных дней.
  async addRate(accountId: string, dto: SetRateDto): Promise<AccountInterestRate> {
    const account = await this.findOne(accountId);
    if (account.interestAccruedThru && dto.effectiveFrom <= account.interestAccruedThru) {
      throw new BadRequestException(
        `Проценты уже начислены по ${account.interestAccruedThru}. Дата ставки должна быть позже.`,
      );
    }
    const [row] = await this.db
      .insert(accountInterestRates)
      .values({ accountId, rate: dto.rate.toFixed(3), effectiveFrom: dto.effectiveFrom })
      .returning();
    return row;
  }

  async removeRate(accountId: string, rateId: string) {
    const [row] = await this.db
      .select()
      .from(accountInterestRates)
      .where(
        and(eq(accountInterestRates.id, rateId), eq(accountInterestRates.accountId, accountId)),
      );
    if (!row) throw new NotFoundException('Ставка не найдена');
    await this.db.delete(accountInterestRates).where(eq(accountInterestRates.id, rateId));
    return { deleted: true };
  }

  async findOne(id: string): Promise<Account> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.id, id));
    if (!row) throw new NotFoundException('Счёт не найден');
    return row;
  }

  async findDefault(): Promise<Account> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.isDefault, true));
    if (!row) throw new NotFoundException('Основной счёт не найден — выполните сидинг');
    return row;
  }

  async create(dto: CreateAccountDto): Promise<Account> {
    const [row] = await this.db
      .insert(accounts)
      .values({
        name: dto.name,
        currency: dto.currency ?? 'RUB',
        initialBalance: (dto.initialBalance ?? 0).toFixed(2),
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateAccountDto): Promise<Account> {
    const account = await this.findOne(id);

    if (dto.isDefault === false && account.isDefault) {
      throw new BadRequestException(
        'Нельзя снять признак основного — назначьте основным другой счёт',
      );
    }
    if (dto.active === false && account.isDefault) {
      throw new BadRequestException('Нельзя архивировать основной счёт');
    }
    if (dto.currency && dto.currency !== account.currency && (await this.usageCount(id)) > 0) {
      throw new ConflictException(
        'У счёта есть операции — валюту менять нельзя, создайте новый счёт',
      );
    }

    return this.db.transaction(async (tx) => {
      // Атомарная смена основного счёта (частичный уникальный индекс допускает ровно один).
      if (dto.isDefault === true && !account.isDefault) {
        await tx.update(accounts).set({ isDefault: false }).where(eq(accounts.isDefault, true));
      }
      const [row] = await tx
        .update(accounts)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...(dto.initialBalance !== undefined && {
            initialBalance: dto.initialBalance.toFixed(2),
          }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.active !== undefined && { active: dto.active }),
          ...(dto.isDefault === true && { isDefault: true, active: true }),
        })
        .where(eq(accounts.id, id))
        .returning();
      return row;
    });
  }

  // Физическое удаление — только пустой и не основной (UX как BR-4 у категорий).
  async remove(id: string) {
    const account = await this.findOne(id);
    if (account.isDefault) {
      throw new BadRequestException('Нельзя удалить основной счёт');
    }
    if ((await this.usageCount(id)) > 0) {
      throw new ConflictException('Счёт используется в операциях — заархивируйте его');
    }
    await this.db.delete(accounts).where(eq(accounts.id, id));
    return { deleted: true };
  }

  private async usageCount(id: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(or(eq(transactions.accountId, id), eq(transactions.toAccountId, id)));
    return row.count;
  }
}
