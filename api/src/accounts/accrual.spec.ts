import {
  accrueDays,
  completedDaysBetween,
  dailyRateFromAnnual,
} from './accrual';

const r = (annual: number) => dailyRateFromAnnual(annual);

describe('dailyRateFromAnnual', () => {
  it('16% годовых → дневная доля', () => {
    expect(dailyRateFromAnnual(16)).toBeCloseTo(16 / 36500, 10);
  });
});

describe('completedDaysBetween', () => {
  it('возвращает дни строго между границами', () => {
    expect(completedDaysBetween('2026-06-01', '2026-06-04')).toEqual([
      '2026-06-02',
      '2026-06-03',
    ]);
  });
  it('сегодня (= верхняя граница) не включается; смежные даты → пусто', () => {
    expect(completedDaysBetween('2026-06-10', '2026-06-11')).toEqual([]);
  });
  it('переход через месяц', () => {
    expect(completedDaysBetween('2026-05-30', '2026-06-02')).toEqual([
      '2026-05-31',
      '2026-06-01',
    ]);
  });
});

describe('accrueDays', () => {
  it('один день: процент на стартовый остаток', () => {
    const out = accrueDays({
      openingBalance: 100000,
      days: [{ date: '2026-06-02', dailyRate: r(36.5), userDelta: 0 }],
    });
    // 36.5%/365 = 0.1%/день → 100 ₽
    expect(out).toEqual([{ date: '2026-06-02', interest: 100, balanceAfter: 100100 }]);
  });

  it('сложный процент: база следующего дня включает начисленное', () => {
    const out = accrueDays({
      openingBalance: 100000,
      days: [
        { date: '2026-06-02', dailyRate: 0.001, userDelta: 0 },
        { date: '2026-06-03', dailyRate: 0.001, userDelta: 0 },
      ],
    });
    expect(out[0].interest).toBe(100); // 100000 * 0.001
    expect(out[1].interest).toBe(100.1); // 100100 * 0.001
    expect(out[1].balanceAfter).toBe(100200.1);
  });

  it('смена ставки в середине периода', () => {
    const out = accrueDays({
      openingBalance: 100000,
      days: [
        { date: '2026-06-02', dailyRate: 0.001, userDelta: 0 }, // 100
        { date: '2026-06-03', dailyRate: 0.002, userDelta: 0 }, // 100100 * 0.002 = 200.2
      ],
    });
    expect(out[0].interest).toBe(100);
    expect(out[1].interest).toBe(200.2);
  });

  it('userDelta меняет базу следующего дня', () => {
    const out = accrueDays({
      openingBalance: 100000,
      days: [
        { date: '2026-06-02', dailyRate: 0.001, userDelta: 50000 }, // %=100, баланс=150100
        { date: '2026-06-03', dailyRate: 0.001, userDelta: 0 }, // 150100 * 0.001 = 150.1
      ],
    });
    expect(out[0].balanceAfter).toBe(150100);
    expect(out[1].interest).toBe(150.1);
  });

  it('нулевой и отрицательный остаток процента не дают', () => {
    const out = accrueDays({
      openingBalance: -500,
      days: [
        { date: '2026-06-02', dailyRate: 0.001, userDelta: 1000 }, // %=0, баланс=500
        { date: '2026-06-03', dailyRate: 0.001, userDelta: 0 }, // 500*0.001=0.5
      ],
    });
    expect(out[0].interest).toBe(0);
    expect(out[1].interest).toBe(0.5);
  });

  it('округление процента до копеек', () => {
    const out = accrueDays({
      openingBalance: 12345,
      days: [{ date: '2026-06-02', dailyRate: r(16), userDelta: 0 }],
    });
    // 12345 * 0.16/365 = 5.4107… → 5.41
    expect(out[0].interest).toBe(5.41);
  });

  it('пустой период — пустой результат', () => {
    expect(accrueDays({ openingBalance: 1000, days: [] })).toEqual([]);
  });
});
