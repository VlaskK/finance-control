// FR-D6 — сборка дерева «категория → подкатегории» из плоских сумм.
// Суммы считает БД (NFR-P1); здесь — только группировка, доли и порядок.

export interface CategoryTotalsRow {
  categoryId: string;
  name: string;
  color: string;
  type: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  amount: number;
  count: number;
}

export interface CategoryTotalsChild {
  categoryId: string | null; // null — операции категории без подкатегории
  name: string;
  amount: number;
  count: number;
  share: number | null; // доля внутри родителя
}

export interface CategoryTotalsItem {
  categoryId: string;
  name: string;
  color: string;
  type: string;
  amount: number;
  count: number;
  share: number | null; // доля внутри своего типа операций
  children: CategoryTotalsChild[];
}

export interface CategoryTotals {
  // Итоги по типам операций — всегда все три ключа, чтобы клиент не проверял наличие.
  totals: { expense: number; income: number; transfer: number };
  items: CategoryTotalsItem[];
}

export const DIRECT_CHILD_LABEL = 'Без подкатегории';

function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((10000 * part) / whole) / 100 : null;
}

export function buildCategoryTotals(rows: CategoryTotalsRow[]): CategoryTotals {
  const roots = new Map<string, CategoryTotalsItem & { direct: { amount: number; count: number } }>();

  for (const row of rows) {
    const root = roots.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      name: row.name,
      color: row.color,
      type: row.type,
      amount: 0,
      count: 0,
      share: null,
      children: [],
      direct: { amount: 0, count: 0 },
    };
    root.amount += row.amount;
    root.count += row.count;

    if (row.subcategoryId) {
      root.children.push({
        categoryId: row.subcategoryId,
        name: row.subcategoryName ?? '',
        amount: row.amount,
        count: row.count,
        share: null,
      });
    } else {
      root.direct.amount += row.amount;
      root.direct.count += row.count;
    }
    roots.set(row.categoryId, root);
  }

  const totals = { expense: 0, income: 0, transfer: 0 };
  for (const root of roots.values()) {
    if (root.type in totals) totals[root.type as keyof typeof totals] += root.amount;
  }

  const items = [...roots.values()]
    .map(({ direct, ...root }) => {
      const children = [...root.children].sort((a, b) => b.amount - a.amount);
      // Строка «без подкатегории» нужна только рядом с реальными подкатегориями:
      // без них собственные операции категории и есть её итог.
      if (children.length > 0 && direct.count > 0) {
        children.push({ categoryId: null, name: DIRECT_CHILD_LABEL, ...direct, share: null });
      }
      return {
        ...root,
        share: share(root.amount, totals[root.type as keyof typeof totals] ?? 0),
        children: children.map((child) => ({
          ...child,
          share: share(child.amount, root.amount),
        })),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return { totals, items };
}
