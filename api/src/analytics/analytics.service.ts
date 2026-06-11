import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import type {
  AnalyticsByCategoryDto,
  BudgetStatusDto,
  DynamicsDto,
  InflationDto,
} from '../common/schemas';
import {
  decomposeChange,
  laspeyresIndex,
  movingAverage,
  percentChange,
  spendIndex,
  type Decomposition,
  type FixedItemPrices,
} from './calculations';
import {
  monthRangeBounds,
  monthsBetween,
  periodBuckets,
  periodRange,
  yearsBetween,
} from './periods';

// Подкатегории сворачиваются на родителя: root = coalesce(parent_id, id).
// Агрегаты считаются на стороне БД (NFR-P1).

interface CategoryAmountRow {
  categoryId: string;
  name: string;
  color: string;
  type: string;
  amount: number;
  count: number;
}

interface BucketRow extends CategoryAmountRow {
  bucket: string;
}

interface DynamicsRow {
  period: string;
  categoryId: string;
  name: string;
  color: string;
  spend: number;
  count: number;
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // Типы операций для выборки: по умолчанию только expense (BR-10), FR-D5 расширяет
  private typesFilter(dto: { includeTransfers: boolean; includeIncome: boolean }) {
    const types = ["'expense'"];
    if (dto.includeTransfers) types.push("'transfer'");
    if (dto.includeIncome) types.push("'income'");
    return sql.raw(`(${types.join(',')})`);
  }

  // CALC-1 (FR-D2) — траты по категориям за период
  async byCategory(dto: AnalyticsByCategoryDto) {
    const { from, to } = periodRange(dto.period, dto.date);
    const rows = (await this.db.execute(sql`
      select root.id as "categoryId", root.name as "name", root.color as "color",
             root.type::text as "type",
             sum(t.amount)::float8 as "amount", count(*)::int as "count"
      from transactions t
      join categories c on c.id = t.category_id
      join categories root on root.id = coalesce(c.parent_id, c.id)
      where t.occurred_at between ${from} and ${to}
        and root.type::text in ${this.typesFilter(dto)}
      group by root.id, root.name, root.color, root.type
      order by sum(t.amount) desc
    `)) as unknown as CategoryAmountRow[];

    const total = rows
      .filter((r) => r.type === 'expense')
      .reduce((acc, r) => acc + r.amount, 0);
    return {
      from,
      to,
      total,
      items: rows.map((r) => ({
        ...r,
        share: total > 0 && r.type === 'expense' ? Math.round((10000 * r.amount) / total) / 100 : null,
      })),
    };
  }

  // FR-D3 — временной ряд внутри периода (день/неделя/месяц → дни, год → месяцы)
  async series(dto: AnalyticsByCategoryDto) {
    const { from, to } = periodRange(dto.period, dto.date);
    const buckets = periodBuckets(dto.period, dto.date);
    const bucketExpr =
      dto.period === 'year'
        ? sql.raw(`to_char(t.occurred_at, 'YYYY-MM')`)
        : sql.raw(`t.occurred_at::text`);

    const rows = (await this.db.execute(sql`
      select ${bucketExpr} as "bucket",
             root.id as "categoryId", root.name as "name", root.color as "color",
             root.type::text as "type",
             sum(t.amount)::float8 as "amount", count(*)::int as "count"
      from transactions t
      join categories c on c.id = t.category_id
      join categories root on root.id = coalesce(c.parent_id, c.id)
      where t.occurred_at between ${from} and ${to}
        and root.type::text in ${this.typesFilter(dto)}
      group by 1, root.id, root.name, root.color, root.type
      order by 1
    `)) as unknown as BucketRow[];

    const categories = [
      ...new Map(
        rows.map((r) => [r.categoryId, { categoryId: r.categoryId, name: r.name, color: r.color }]),
      ).values(),
    ];
    return {
      buckets,
      categories,
      points: rows.map(({ bucket, categoryId, amount }) => ({ bucket, categoryId, amount })),
    };
  }

  // CALC-3/4/5 (FR-E1…E3) — динамика по категориям за диапазон месяцев или лет
  async dynamics(dto: DynamicsDto) {
    const { from, to } = monthRangeBounds(dto.from, dto.to);
    const periods =
      dto.granularity === 'year'
        ? yearsBetween(dto.from, dto.to)
        : monthsBetween(dto.from, dto.to);
    const periodExpr =
      dto.granularity === 'year'
        ? sql.raw(`to_char(t.occurred_at, 'YYYY')`)
        : sql.raw(`to_char(t.occurred_at, 'YYYY-MM')`);

    const rows = (await this.db.execute(sql`
      select ${periodExpr} as "period",
             root.id as "categoryId", root.name as "name", root.color as "color",
             sum(t.amount)::float8 as "spend", count(*)::int as "count"
      from transactions t
      join categories c on c.id = t.category_id
      join categories root on root.id = coalesce(c.parent_id, c.id)
      where root.type = 'expense'
        and t.occurred_at between ${from} and ${to}
      group by 1, root.id, root.name, root.color
    `)) as unknown as DynamicsRow[];

    const byCategory = new Map<string, { name: string; color: string; rows: Map<string, DynamicsRow> }>();
    for (const row of rows) {
      const entry = byCategory.get(row.categoryId) ?? {
        name: row.name,
        color: row.color,
        rows: new Map<string, DynamicsRow>(),
      };
      entry.rows.set(row.period, row);
      byCategory.set(row.categoryId, entry);
    }

    const categories = [...byCategory.entries()].map(([categoryId, entry]) => {
      const spends = periods.map((p) => entry.rows.get(p)?.spend ?? 0);
      const counts = periods.map((p) => entry.rows.get(p)?.count ?? 0);
      const avgTickets = periods.map((p, i) =>
        counts[i] > 0 ? Math.round((100 * spends[i]) / counts[i]) / 100 : null,
      );
      const indices = spendIndex(spends); // CALC-3
      const smoothed = movingAverage(avgTickets); // CALC-4
      const base = { count: counts[0], avgTicket: avgTickets[0] ?? 0 };

      return {
        categoryId,
        name: entry.name,
        color: entry.color,
        points: periods.map((period, i) => ({
          period,
          spend: spends[i],
          count: counts[i],
          avgTicket: avgTickets[i],
          avgTicketSmoothed: smoothed[i],
          spendIndex: indices[i],
          changePct: indices[i] === null ? null : Math.round((indices[i]! - 100) * 100) / 100,
          // CALC-5 — разложение vs базовый период (для базового и пустой базы — null)
          decomposition:
            i === 0 || base.count === 0
              ? null
              : (decomposeChange(base, {
                  count: counts[i],
                  avgTicket: avgTickets[i] ?? 0,
                }) satisfies Decomposition),
        })),
      };
    });

    categories.sort(
      (a, b) =>
        b.points.reduce((acc, p) => acc + p.spend, 0) -
        a.points.reduce((acc, p) => acc + p.spend, 0),
    );
    return { periods, granularity: dto.granularity, categories };
  }

  // CALC-6 (FR-E4) — индекс личной инфляции по фикс-позициям (BR-12)
  async inflation(dto: InflationDto) {
    const months = monthsBetween(dto.from, dto.to);
    const { from, to } = monthRangeBounds(dto.from, dto.to);

    const fixedItems = (await this.db.execute(sql`
      select r.id as "id", r.name as "name"
      from recurring_items r
      where r.is_fixed_price = true
      order by r.name
    `)) as unknown as { id: string; name: string }[];

    // Цена позиции в месяце — среднее по её операциям (обычно операция одна)
    const priceRows = (await this.db.execute(sql`
      select r.id as "id", to_char(t.occurred_at, 'YYYY-MM') as "month",
             avg(t.amount)::float8 as "price"
      from recurring_items r
      join transactions t on t.recurring_id = r.id
      where r.is_fixed_price = true
        and t.occurred_at between ${from} and ${to}
      group by r.id, 2
    `)) as unknown as { id: string; month: string; price: number }[];

    const priceMap = new Map<string, Map<string, number>>();
    for (const row of priceRows) {
      const byMonth = priceMap.get(row.id) ?? new Map<string, number>();
      byMonth.set(row.month, row.price);
      priceMap.set(row.id, byMonth);
    }

    const series: FixedItemPrices[] = fixedItems.map((item) => ({
      id: item.id,
      name: item.name,
      prices: months.map((m) => priceMap.get(item.id)?.get(m) ?? null),
    }));

    const { cpi, items } = laspeyresIndex(series);
    const mom = percentChange(cpi, 1);
    const yoy = percentChange(cpi, 12);

    return {
      // Заглушка с объяснением показывается фронтом, когда available = false (FR-E4)
      available: items.length > 0,
      fixedItemsTotal: fixedItems.length,
      months,
      items,
      cpi: months.map((month, i) => ({
        month,
        value: cpi[i],
        mom: mom[i],
        yoy: yoy[i],
      })),
    };
  }

  // CALC-2 (FR-D4) — план/факт по бюджетам за месяц
  async budgetStatus(dto: BudgetStatusDto) {
    const { from, to } = monthRangeBounds(dto.month, dto.month);
    const rows = (await this.db.execute(sql`
      select b.category_id as "categoryId", b.monthly_limit::float8 as "monthlyLimit",
             cat.name as "categoryName", cat.color as "categoryColor",
             coalesce((
               select sum(t.amount) from transactions t
               where (t.category_id = b.category_id or t.subcategory_id = b.category_id)
                 and t.occurred_at between ${from} and ${to}
             ), 0)::float8 as "fact"
      from budgets b
      join categories cat on cat.id = b.category_id
      order by cat.name
    `)) as unknown as {
      categoryId: string;
      monthlyLimit: number;
      categoryName: string;
      categoryColor: string;
      fact: number;
    }[];

    return {
      month: dto.month,
      items: rows.map((r) => ({
        ...r,
        variance: Math.round((r.fact - r.monthlyLimit) * 100) / 100, // CALC-2
        overspent: r.fact > r.monthlyLimit,
      })),
    };
  }
}
