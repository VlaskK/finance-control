import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { accountInterestRates, accounts, categories, transactions } from '../database/schema';
import { round2 } from '../transactions/money';
import { accrueDays, completedDaysBetween, dailyRateFromAnnual, type AccrualDay } from './accrual';

const INTEREST_CATEGORY = 'Проценты';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function prevDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AccrualService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccrualService.name);
  private running = false;

  constructor(@Inject(DB) private readonly db: Database) {}

  async onApplicationBootstrap() {
    await this.safeAccrueAll();
    // Если ПК работает сутками — начисляем за прошедший день. Идемпотентно по interestAccruedThru.
    setInterval(() => void this.safeAccrueAll(), 24 * 60 * 60 * 1000).unref?.();
  }

  private async safeAccrueAll() {
    if (this.running) return;
    this.running = true;
    try {
      const credited = await this.accrueAll();
      if (credited > 0) this.logger.log(`Начислены проценты: ${credited} операц.`);
    } catch (err) {
      this.logger.error(`Ошибка начисления процентов: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // Возвращает число созданных операций процентов.
  async accrueAll(): Promise<number> {
    const today = todayIso();
    const allAccounts = await this.db.select().from(accounts);
    let created = 0;

    for (const account of allAccounts) {
      const rates = await this.db
        .select()
        .from(accountInterestRates)
        .where(eq(accountInterestRates.accountId, account.id))
        .orderBy(asc(accountInterestRates.effectiveFrom));
      if (!rates.length) continue;

      // Старт: с указанной даты первой ставки (бэкфилл от effectiveFrom)
      let last = account.interestAccruedThru;
      if (!last) {
        last = prevDay(rates[0].effectiveFrom);
      }

      const days = completedDaysBetween(last, today);
      if (!days.length) continue;

      const openingBalance = await this.balanceAsOf(account.id, last);
      const deltas = await this.userDeltasByDay(account.id, last, today);

      const rateFor = (date: string): number => {
        let applicable = 0;
        for (const r of rates) {
          if (r.effectiveFrom <= date) applicable = Number(r.rate);
          else break;
        }
        return applicable;
      };

      const accrualDays: AccrualDay[] = days.map((date) => ({
        date,
        dailyRate: dailyRateFromAnnual(rateFor(date)),
        userDelta: deltas.get(date) ?? 0,
      }));

      const accrued = accrueDays({ openingBalance, days: accrualDays });
      const positives = accrued.filter((a) => a.interest > 0);

      if (positives.length) {
        const categoryId = await this.interestCategoryId();
        const rubRate = account.currency === 'RUB' ? 1 : await this.latestFxRate(account.id);
        const rows = positives.map((a) => ({
          amount: a.interest.toFixed(2),
          categoryId,
          occurredAt: a.date,
          currency: account.currency,
          accountId: account.id,
          baseAmount: round2(a.interest * rubRate).toFixed(2),
          rate: account.currency === 'RUB' ? null : String(rubRate),
          label: INTEREST_CATEGORY,
        }));
        await this.db.insert(transactions).values(rows);
        created += rows.length;
      }

      // Двигаем границу на последний завершённый день, даже если процент был 0
      await this.db
        .update(accounts)
        .set({ interestAccruedThru: days[days.length - 1] })
        .where(eq(accounts.id, account.id));
    }

    return created;
  }

  private async balanceAsOf(accountId: string, date: string): Promise<number> {
    const [row] = (await this.db.execute(sql`
      select (a.initial_balance
        + coalesce((
            select sum(case when c.type = 'income' then t.amount else -t.amount end)
            from transactions t join categories c on c.id = t.category_id
            where t.account_id = ${accountId} and t.occurred_at <= ${date}
          ), 0)
        + coalesce((
            select sum(t.to_amount) from transactions t
            where t.to_account_id = ${accountId} and t.occurred_at <= ${date}
          ), 0)
      )::float8 as "balance"
      from accounts a where a.id = ${accountId}
    `)) as unknown as { balance: number }[];
    return row?.balance ?? 0;
  }

  // Нетто пользовательских движений по дням в интервале (last, today)
  private async userDeltasByDay(
    accountId: string,
    lastExclusive: string,
    todayExclusive: string,
  ): Promise<Map<string, number>> {
    const rows = (await this.db.execute(sql`
      select d as "date", sum(delta)::float8 as "delta" from (
        select t.occurred_at as d,
               case when c.type = 'income' then t.amount else -t.amount end as delta
        from transactions t join categories c on c.id = t.category_id
        where t.account_id = ${accountId}
          and t.occurred_at > ${lastExclusive} and t.occurred_at < ${todayExclusive}
        union all
        select t.occurred_at as d, t.to_amount as delta
        from transactions t
        where t.to_account_id = ${accountId}
          and t.occurred_at > ${lastExclusive} and t.occurred_at < ${todayExclusive}
      ) x group by d
    `)) as unknown as { date: string; delta: number }[];
    return new Map(rows.map((r) => [r.date, r.delta]));
  }

  private async latestFxRate(accountId: string): Promise<number> {
    const [row] = (await this.db.execute(sql`
      select t.rate::float8 as "rate" from transactions t
      where t.account_id = ${accountId} and t.rate is not null
      order by t.occurred_at desc, t.created_at desc limit 1
    `)) as unknown as { rate: number }[];
    return row?.rate ?? 1; // нет известного курса — 1:1 (уточнится в валютном проходе)
  }

  private async interestCategoryId(): Promise<string> {
    const [existing] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.name, INTEREST_CATEGORY), eq(categories.type, 'income')));
    if (existing) return existing.id;
    const [created] = await this.db
      .insert(categories)
      .values({ name: INTEREST_CATEGORY, type: 'income', color: '#1abc9c' })
      .returning({ id: categories.id });
    return created.id;
  }
}
