import {
  bar,
  escapeHtml,
  formatAccounts,
  formatAmount,
  formatBreakdown,
  formatBudget,
  formatConfirmation,
  formatDynamics,
  formatStats,
} from './format';

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

  it('доход подписывается как доход', () => {
    const text = formatConfirmation({ ...tx, type: 'income', currency: 'RUB', baseAmount: '500' });
    expect(text).toContain('✅ Доход');
  });

  it('перевод показывает маршрут и зачисление', () => {
    const text = plain(
      formatConfirmation({
        ...tx,
        type: 'transfer',
        currency: 'USD',
        toAccountName: 'Общий',
        toAmount: '45250',
        toCurrency: 'RUB',
      }),
    );
    expect(text).toContain('✅ Перевод');
    expect(text).toContain('Валютный → Общий');
    expect(text).toContain('зачислено 45 250 ₽');
  });

  it('перевод вне счетов', () => {
    const text = formatConfirmation({
      ...tx,
      type: 'transfer',
      toAccountName: null,
      toAmount: null,
      toCurrency: null,
    });
    expect(text).toContain('→ вне счетов');
  });
});

describe('bar', () => {
  it('пропорционально максимуму, ширина фиксированная', () => {
    expect(bar(50, 100, 8)).toBe('████░░░░');
    expect(bar(100, 100, 8)).toBe('████████');
  });

  it('ноль и нулевой максимум — пустой бар', () => {
    expect(bar(0, 100, 8)).toBe('░░░░░░░░');
    expect(bar(5, 0, 8)).toBe('░░░░░░░░');
  });

  it('маленькое, но ненулевое значение — минимум одна клетка', () => {
    expect(bar(1, 1000, 8)).toBe('█░░░░░░░');
  });
});

describe('formatStats', () => {
  const data = {
    from: '2026-06-01',
    to: '2026-06-30',
    total: 300,
    items: [
      { name: 'Еда', type: 'expense', amount: 200, count: 2, share: 66.7 },
      { name: 'Такси', type: 'expense', amount: 100, count: 1, share: 33.3 },
      { name: 'Зарплата', type: 'income', amount: 50000, count: 1, share: null },
    ],
  };

  it('расходы с барами, доходы скрыты без флага', () => {
    const text = formatStats('июнь', data, { income: false });
    expect(text).toContain('Расходы · июнь');
    expect(text).toContain('█');
    expect(text).toContain('67%');
    expect(text).not.toContain('Зарплата');
  });

  it('с флагом — секция доходов и баланс', () => {
    const text = plain(formatStats('июнь', data, { income: true }));
    expect(text).toContain('Доходы');
    expect(text).toContain('Зарплата');
    expect(text).toContain('Баланс');
    expect(text).toContain('49 700'); // 50 000 − 300
  });

  it('пустой период', () => {
    expect(formatStats('июнь', { ...data, total: 0, items: [] }, { income: false })).toContain(
      'трат нет',
    );
  });
});

describe('formatDynamics', () => {
  const data = {
    periods: ['2026-05', '2026-06'],
    categories: [
      {
        name: 'Еда',
        points: [
          { period: '2026-05', spend: 100 },
          { period: '2026-06', spend: 150 },
        ],
      },
      {
        name: 'Такси',
        points: [
          { period: '2026-05', spend: 50 },
          { period: '2026-06', spend: 25 },
        ],
      },
    ],
  };

  it('итоги по месяцам с барами', () => {
    const text = plain(formatDynamics(data));
    expect(text).toContain('2026-05');
    expect(text).toContain('150 ₽'); // 100+50
    expect(text).toContain('175 ₽'); // 150+25
  });

  it('топ изменений к прошлому месяцу', () => {
    const text = formatDynamics(data);
    expect(text).toContain('Еда +50%');
    expect(text).toContain('Такси -50%');
  });
});

describe('formatAccounts', () => {
  it('основной помечен, ставка показана', () => {
    const text = plain(
      formatAccounts([
        { name: 'Общий', currency: 'RUB', balance: 1000, isDefault: true, currentRate: null },
        { name: 'Вклад', currency: 'RUB', balance: 50000, isDefault: false, currentRate: 18 },
      ]),
    );
    expect(text).toContain('✅ Общий');
    expect(text).toContain('1 000 ₽');
    expect(text).toContain('ставка 18%');
  });

  it('пусто — заглушка', () => {
    expect(formatAccounts([])).toBe('Нет активных счетов.');
  });
});
