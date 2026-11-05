import {
  buildCategoryTotals,
  DIRECT_CHILD_LABEL,
  type CategoryTotalsRow,
} from './category-totals';

function row(over: Partial<CategoryTotalsRow>): CategoryTotalsRow {
  return {
    categoryId: 'cat-food',
    name: 'Еда',
    color: '#111111',
    type: 'expense',
    subcategoryId: null,
    subcategoryName: null,
    amount: 100,
    count: 1,
    ...over,
  };
}

describe('buildCategoryTotals', () => {
  it('складывает подкатегории в категорию и считает доли', () => {
    const { items, totals } = buildCategoryTotals([
      row({ subcategoryId: 'sub-coffee', subcategoryName: 'Кофе', amount: 300, count: 3 }),
      row({ subcategoryId: 'sub-shop', subcategoryName: 'Продукты', amount: 700, count: 2 }),
    ]);

    expect(totals).toEqual({ expense: 1000, income: 0, transfer: 0 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ categoryId: 'cat-food', amount: 1000, count: 5, share: 100 });
    // Подкатегории — по убыванию суммы, доля считается внутри категории.
    expect(items[0].children.map((c) => [c.name, c.amount, c.share])).toEqual([
      ['Продукты', 700, 70],
      ['Кофе', 300, 30],
    ]);
  });

  it('добавляет «без подкатегории» только рядом с реальными подкатегориями', () => {
    const withSubs = buildCategoryTotals([
      row({ subcategoryId: 'sub-coffee', subcategoryName: 'Кофе', amount: 400 }),
      row({ amount: 100, count: 2 }),
    ]);
    const direct = withSubs.items[0].children.at(-1)!;
    expect(direct).toMatchObject({ categoryId: null, name: DIRECT_CHILD_LABEL, amount: 100, count: 2 });

    const onlyDirect = buildCategoryTotals([row({ amount: 500 })]);
    expect(onlyDirect.items[0]).toMatchObject({ amount: 500, children: [] });
  });

  it('доли считаются внутри своего типа операций, итоги — по типам', () => {
    const { items, totals } = buildCategoryTotals([
      row({ amount: 200 }),
      row({ categoryId: 'cat-fun', name: 'Развлечения', amount: 600 }),
      row({ categoryId: 'cat-salary', name: 'Зарплата', type: 'income', amount: 50_000 }),
    ]);

    expect(totals).toEqual({ expense: 800, income: 50_000, transfer: 0 });
    // Категории отсортированы по сумме, доход не размывает доли расходов.
    expect(items.map((i) => [i.name, i.share])).toEqual([
      ['Зарплата', 100],
      ['Развлечения', 75],
      ['Еда', 25],
    ]);
  });

  it('пустая выборка — нулевые итоги без категорий', () => {
    expect(buildCategoryTotals([])).toEqual({
      totals: { expense: 0, income: 0, transfer: 0 },
      items: [],
    });
  });
});
