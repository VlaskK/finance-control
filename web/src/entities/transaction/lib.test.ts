import { describe, expect, it } from 'vitest';
import { groupByDate } from './lib';
import { parseAmountInput } from '@/shared/lib/money';
import type { TransactionRow } from '@/shared/api/types';

function tx(partial: Partial<TransactionRow>): TransactionRow {
  return {
    id: Math.random().toString(36).slice(2),
    amount: '100',
    occurredAt: '2026-06-11',
    currency: 'RUB',
    categoryId: 'c1',
    categoryName: 'Продукты',
    categoryColor: '#e74c3c',
    type: 'expense',
    subcategoryId: null,
    subcategoryName: null,
    label: null,
    note: null,
    recurringId: null,
    createdAt: '2026-06-11T10:00:00Z',
    tags: [],
    ...partial,
  };
}

describe('groupByDate (FR-B1)', () => {
  it('группирует по дням, новые сверху', () => {
    const groups = groupByDate([
      tx({ occurredAt: '2026-06-10' }),
      tx({ occurredAt: '2026-06-11' }),
      tx({ occurredAt: '2026-06-11' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-06-11', '2026-06-10']);
    expect(groups[0].rows).toHaveLength(2);
  });

  it('итог дня — только expense (BR-10)', () => {
    const groups = groupByDate([
      tx({ amount: '300' }),
      tx({ amount: '1000', type: 'transfer' }),
      tx({ amount: '200' }),
    ]);
    expect(groups[0].expenseTotal).toBe(500);
  });
});

describe('parseAmountInput (FR-A6)', () => {
  it('понимает запятую и пробелы', () => {
    expect(parseAmountInput('1 234,56')).toBe(1234.56);
    expect(parseAmountInput('500')).toBe(500);
  });

  it('мусор → null', () => {
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('')).toBeNull();
  });
});
