import { describe, expect, it } from 'vitest';
import { childRowId, rangeOf, selectionSums } from './lib';
import type { CategoryTotalsItem } from '@/shared/api/types';

function cat(partial: Partial<CategoryTotalsItem>): CategoryTotalsItem {
  return {
    categoryId: 'c-food',
    name: 'Еда',
    color: '#e74c3c',
    type: 'expense',
    amount: 1000,
    count: 5,
    share: 100,
    children: [],
    ...partial,
  };
}

describe('rangeOf', () => {
  it('«всё время» — без границ, свой период — выбранные даты', () => {
    expect(rangeOf('all', { from: '2026-01-01', to: '2026-01-31' })).toEqual({});
    expect(rangeOf('custom', { from: '2026-03-05', to: '2026-04-10' })).toEqual({
      from: '2026-03-05',
      to: '2026-04-10',
    });
  });

  it('пустая дата своего периода не попадает в запрос', () => {
    expect(rangeOf('custom', { from: '', to: '2026-04-10' })).toEqual({
      from: undefined,
      to: '2026-04-10',
    });
  });

  it('пресеты дают полный календарный период', () => {
    const year = rangeOf('year', { from: '', to: '' });
    expect(year.from?.slice(4)).toBe('-01-01');
    expect(year.to?.slice(4)).toBe('-12-31');

    const month = rangeOf('month', { from: '', to: '' });
    expect(month.from?.slice(8)).toBe('01');
    // Последний день месяца — 28…31, но никогда 01.
    expect(Number(month.to?.slice(8))).toBeGreaterThanOrEqual(28);
  });
});

describe('selectionSums', () => {
  const items = [
    cat({
      children: [
        { categoryId: 's-coffee', name: 'Кофе', amount: 300, count: 3, share: 30 },
        { categoryId: null, name: 'Без подкатегории', amount: 700, count: 2, share: 70 },
      ],
    }),
    cat({ categoryId: 'c-salary', name: 'Зарплата', type: 'income', amount: 50_000, count: 1 }),
  ];

  it('суммирует выбранные категории по типам операций', () => {
    expect(selectionSums(items, ['c-food', 'c-salary'])).toEqual({
      totals: { expense: 1000, income: 50_000, transfer: 0 },
      rows: 2,
    });
  });

  it('считает выбранные подкатегории, включая «без подкатегории»', () => {
    expect(selectionSums(items, ['s-coffee'])).toMatchObject({
      totals: { expense: 300, income: 0, transfer: 0 },
      rows: 1,
    });
    expect(selectionSums(items, [childRowId('c-food', null)])).toMatchObject({
      totals: { expense: 700 },
      rows: 1,
    });
  });

  it('выбранная категория не складывается со своими подкатегориями дважды', () => {
    expect(selectionSums(items, ['c-food', 's-coffee'])).toEqual({
      totals: { expense: 1000, income: 0, transfer: 0 },
      rows: 1,
    });
  });

  it('без выбора — нули', () => {
    expect(selectionSums(items, [])).toEqual({
      totals: { expense: 0, income: 0, transfer: 0 },
      rows: 0,
    });
  });
});
