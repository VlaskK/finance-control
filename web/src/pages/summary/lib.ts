// Чистые функции экрана сводки (FR-D6): границы периода и сумма выделенного.

import { currentMonthIso, shiftMonths, todayIso } from '@/shared/lib/dates';
import type { CategoryTotalsItem, TxType } from '@/shared/api/types';

export type RangePreset = 'month' | 'prevMonth' | 'year' | 'all' | 'custom';

export interface SummaryRange {
  from?: string;
  to?: string;
}

// Последний день месяца: нулевой день следующего (UTC, как occurred_at).
function monthEnd(isoMonth: string): string {
  const [y, m] = isoMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Пустые границы — «за всё время»: клиент просто не передаёт from/to.
export function rangeOf(preset: RangePreset, custom: { from: string; to: string }): SummaryRange {
  switch (preset) {
    case 'month': {
      const month = currentMonthIso();
      return { from: `${month}-01`, to: monthEnd(month) };
    }
    case 'prevMonth': {
      const month = shiftMonths(currentMonthIso(), -1);
      return { from: `${month}-01`, to: monthEnd(month) };
    }
    case 'year': {
      const year = todayIso().slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    case 'all':
      return {};
    case 'custom':
      return { from: custom.from || undefined, to: custom.to || undefined };
  }
}

// Строка «без подкатегории» не имеет своего id — собираем его из родителя.
export const directRowId = (categoryId: string) => `${categoryId}:direct`;

export const childRowId = (categoryId: string, childId: string | null) =>
  childId ?? directRowId(categoryId);

export interface SelectionSums {
  totals: Record<TxType, number>;
  rows: number; // сколько строк учтено в сумме
}

// Сумма выделенного по типам операций. Выделенная категория включает свои
// подкатегории целиком, поэтому их отдельные отметки в сумму не идут дважды.
export function selectionSums(
  items: CategoryTotalsItem[],
  selected: string[],
): SelectionSums {
  const totals: Record<TxType, number> = { expense: 0, income: 0, transfer: 0 };
  let rows = 0;

  for (const item of items) {
    if (selected.includes(item.categoryId)) {
      totals[item.type] += item.amount;
      rows += 1;
      continue;
    }
    for (const child of item.children) {
      if (selected.includes(childRowId(item.categoryId, child.categoryId))) {
        totals[item.type] += child.amount;
        rows += 1;
      }
    }
  }

  return { totals, rows };
}
