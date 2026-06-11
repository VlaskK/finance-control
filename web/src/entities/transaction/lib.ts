import type { TransactionRow } from '@/shared/api/types';

export interface DayGroup {
  date: string;
  rows: TransactionRow[];
  expenseTotal: number;
}

// FR-B1 — группировка по дням, новые сверху; итог дня — только потребление (BR-10)
export function groupByDate(rows: TransactionRow[]): DayGroup[] {
  const groups = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    const list = groups.get(row.occurredAt) ?? [];
    list.push(row);
    groups.set(row.occurredAt, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, dayRows]) => ({
      date,
      rows: dayRows,
      expenseTotal: dayRows
        .filter((r) => r.type === 'expense')
        .reduce((acc, r) => acc + Number(r.amount), 0),
    }));
}
