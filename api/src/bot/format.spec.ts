import { escapeHtml, formatAmount, formatBreakdown, formatBudget, formatConfirmation } from './format';

// Intl для ru-RU использует неразрывные пробелы — нормализуем для сравнения.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('escapeHtml', () => {
  it('экранирует HTML-опасные символы', () => {
    expect(escapeHtml('<b>x & y</b>')).toBe('&lt;b&gt;x &amp; y&lt;/b&gt;');
  });
});

describe('formatAmount', () => {
  it('рубли — символ ₽', () => {
    expect(plain(formatAmount(1234.56))).toBe('1 234,56 ₽');
  });

  it('иностранная валюта — код', () => {
    expect(plain(formatAmount(500, 'USD'))).toBe('500 USD');
  });

  it('целые без дробной части', () => {
    expect(plain(formatAmount(200))).toBe('200 ₽');
  });
});

describe('formatBreakdown', () => {
  const data = {
    from: '2026-07-01',
    to: '2026-07-31',
    total: 300,
    items: [
      { name: 'Еда', type: 'expense', amount: 200, count: 2, share: 67 },
      { name: 'Такси', type: 'expense', amount: 100, count: 1, share: 33 },
      { name: 'Зарплата', type: 'income', amount: 50000, count: 1, share: null },
    ],
  };

  it('показывает только расходы с долями', () => {
    const text = formatBreakdown('Тест', data);
    expect(text).toContain('Еда');
    expect(text).toContain('67%');
    expect(text).not.toContain('Зарплата');
  });

  it('экранирует название категории', () => {
    const evil = {
      ...data,
      items: [{ name: '<script>', type: 'expense', amount: 1, count: 1, share: null }],
    };
    expect(formatBreakdown('Тест', evil)).toContain('&lt;script&gt;');
  });

  it('пустой период — отдельное сообщение', () => {
    expect(formatBreakdown('Тест', { ...data, items: [] })).toContain('трат нет');
  });
});

describe('formatBudget', () => {
  it('маркирует превышение', () => {
    const text = formatBudget({
      month: '2026-07',
      items: [
        { categoryId: '1', categoryName: 'Еда', monthlyLimit: 100, fact: 150, overspent: true },
        { categoryId: '2', categoryName: 'Дом', monthlyLimit: 100, fact: 10, overspent: false },
      ],
    });
    expect(text).toContain('🔴 Еда');
    expect(text).toContain('🟢 Дом');
    expect(plain(text)).toContain('(150%)');
  });

  it('без лимитов — подсказка', () => {
    expect(formatBudget({ month: '2026-07', items: [] })).toContain('не заданы');
  });
});

describe('formatConfirmation', () => {
  const tx = {
    amount: '500',
    currency: 'USD',
    baseAmount: '45250',
    accountName: 'Валютный',
    categoryName: 'Еда',
    subcategoryName: 'Кофе',
    label: 'старбакс',
  };

  it('валютная трата показывает рублёвый эквивалент', () => {
    const text = plain(formatConfirmation(tx));
    expect(text).toContain('500 USD');
    expect(text).toContain('≈ 45 250 ₽');
    expect(text).toContain('Еда / Кофе');
    expect(text).toContain('«старбакс»');
  });

  it('рублёвая трата без эквивалента', () => {
    const text = formatConfirmation({ ...tx, currency: 'RUB', amount: '200', baseAmount: '200' });
    expect(text).not.toContain('≈');
  });

  it('добавляет бюджетный алерт', () => {
    expect(formatConfirmation(tx, '🔴 Превышен')).toContain('🔴 Превышен');
  });
});
