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

// РџРѕРґРєР°С‚РµРіРѕСЂРёРё СЃРІРѕСЂР°С‡РёРІР°СЋС‚СЃСЏ РЅР° СЂРѕРґРёС‚РµР»СЏ: root = coalesce(parent_id, id).
// РђРіСЂРµРіР°С‚С‹ СЃС‡РёС‚Р°СЋС‚СЃСЏ РЅР° СЃС‚РѕСЂРѕРЅРµ Р‘Р” (NFR-P1).

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

  // РўРёРїС‹ РѕРїРµСЂР°С†РёР№ РґР»СЏ РІС‹Р±РѕСЂРєРё: РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ С‚РѕР»СЊРєРѕ expense (BR-10), FR-D5 СЂР°СЃС€РёСЂСЏРµС‚
  private typesFilter(dto: { includeTransfers: boolean; includeIncome: boolean }) {
    const types = ["'expense'"];
    if (dto.includeTransfers) types.push("'transfer'");
    if (dto.includeIncome) types.push("'income'");
    return sql.raw(`(${types.join(',')})`);
  }

  // CALC-1 (FR-D2) вЂ” С‚СЂР°С‚С‹ РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј Р·Р° РїРµСЂРёРѕРґ
  async byCategory(dto: AnalyticsByCategoryDto) {
    const { from, to } = periodRange(dto.period, dto.date);
    const rows = (await this.db.execute(sql`
      select root.id as "categoryId", root.name as "name", root.color as "color",
             root.type::text as "type",
             sum(t.base_amount)::float8 as "amount", count(*)::int as "count"
      from transactions t
      join categories c on c.id = t.category_id
      join categories root on root.id = coalesce(c.parent_id, c.id)
      where t.occurred_at between ${from} and ${to}
        and root.type::text in ${this.typesFilter(dto)}
      group by root.id, root.name, root.color, root.type
      order by sum(t.base_amount) desc
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

  // FR-D3 вЂ” РІСЂРµРјРµРЅРЅРѕР№ СЂСЏРґ РІРЅСѓС‚СЂРё РїРµСЂРёРѕРґР° (РґРµРЅСЊ/РЅРµРґРµР»СЏ/РјРµСЃСЏС† в†’ РґРЅРё, РіРѕРґ в†’ РјРµСЃСЏС†С‹)
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
             sum(t.base_amount)::float8 as "amount", count(*)::int as "count"
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

  // CALC-3/4/5 (FR-E1вЂ¦E3) вЂ” РґРёРЅР°РјРёРєР° РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј Р·Р° РґРёР°РїР°Р·РѕРЅ РјРµСЃСЏС†РµРІ РёР»Рё Р»РµС‚
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
             sum(t.base_amount)::float8 as "spend", count(*)::int as "count"
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
          // CALC-5 вЂ” СЂР°Р·Р»РѕР¶РµРЅРёРµ vs Р±Р°Р·РѕРІС‹Р№ РїРµСЂРёРѕРґ (РґР»СЏ Р±Р°Р·РѕРІРѕРіРѕ Рё РїСѓСЃС‚РѕР№ Р±Р°Р·С‹ вЂ” null)
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

  // CALC-6 (FR-E4) вЂ” РёРЅРґРµРєСЃ Р»РёС‡РЅРѕР№ РёРЅС„Р»СЏС†РёРё РїРѕ С„РёРєСЃ-РїРѕР·РёС†РёСЏРј (BR-12)
  async inflation(dto: InflationDto) {
    const months = monthsBetween(dto.from, dto.to);
    const { from, to } = monthRangeBounds(dto.from, dto.to);

    const fixedItems = (await this.db.execute(sql`
      select r.id as "id", r.name as "name"
      from recurring_items r
      where r.is_fixed_price = true
      order by r.name
    `)) as unknown as { id: string; name: string }[];

    // Р¦РµРЅР° РїРѕР·РёС†РёРё РІ РјРµСЃСЏС†Рµ вЂ” СЃСЂРµРґРЅРµРµ РїРѕ РµС‘ РѕРїРµСЂР°С†РёСЏРј (РѕР±С‹С‡РЅРѕ РѕРїРµСЂР°С†РёСЏ РѕРґРЅР°)
    const priceRows = (await this.db.execute(sql`
      select r.id as "id", to_char(t.occurred_at, 'YYYY-MM') as "month",
             avg(t.base_amount)::float8 as "price"
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
      // Р—Р°РіР»СѓС€РєР° СЃ РѕР±СЉСЏСЃРЅРµРЅРёРµРј РїРѕРєР°Р·С‹РІР°РµС‚СЃСЏ С„СЂРѕРЅС‚РѕРј, РєРѕРіРґР° available = false (FR-E4)
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

  // CALC-2 (FR-D4) вЂ” РїР»Р°РЅ/С„Р°РєС‚ РїРѕ Р±СЋРґР¶РµС‚Р°Рј Р·Р° РјРµСЃСЏС†
  async budgetStatus(dto: BudgetStatusDto) {
    const { from, to } = monthRangeBounds(dto.month, dto.month);
    const rows = (await this.db.execute(sql`
      select b.category_id as "categoryId", b.monthly_limit::float8 as "monthlyLimit",
             cat.name as "categoryName", cat.color as "categoryColor",
             coalesce((
               select sum(t.base_amount) from transactions t
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
