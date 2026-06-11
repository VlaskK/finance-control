import { monthRangeBounds, monthsBetween, periodBuckets, periodRange, yearsBetween } from './periods';

describe('periodRange (FR-D1)', () => {
  it('день', () => {
    expect(periodRange('day', '2026-06-11')).toEqual({ from: '2026-06-11', to: '2026-06-11' });
  });

  it('неделя начинается с понедельника', () => {
    // 2026-06-11 — четверг
    expect(periodRange('week', '2026-06-11')).toEqual({ from: '2026-06-08', to: '2026-06-14' });
    // воскресенье относится к той же неделе
    expect(periodRange('week', '2026-06-14')).toEqual({ from: '2026-06-08', to: '2026-06-14' });
  });

  it('месяц учитывает длину месяца и високосный год', () => {
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('month', '2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(periodRange('month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('год', () => {
    expect(periodRange('year', '2026-06-11')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('periodBuckets (FR-D3)', () => {
  it('неделя — 7 дней', () => {
    const buckets = periodBuckets('week', '2026-06-11');
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toBe('2026-06-08');
    expect(buckets[6]).toBe('2026-06-14');
  });

  it('месяц — по дням', () => {
    expect(periodBuckets('month', '2026-02-15')).toHaveLength(28);
  });

  it('год — 12 месяцев', () => {
    const buckets = periodBuckets('year', '2026-06-11');
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toBe('2026-01');
    expect(buckets[11]).toBe('2026-12');
  });
});

describe('monthsBetween / yearsBetween (FR-E1)', () => {
  it('диапазон месяцев через границу года', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('один месяц', () => {
    expect(monthsBetween('2026-06', '2026-06')).toEqual(['2026-06']);
  });

  it('диапазон лет', () => {
    expect(yearsBetween('2024-05', '2026-01')).toEqual(['2024', '2025', '2026']);
  });
});

describe('monthRangeBounds', () => {
  it('границы дат диапазона месяцев', () => {
    expect(monthRangeBounds('2026-01', '2026-02')).toEqual({
      from: '2026-01-01',
      to: '2026-02-28',
    });
  });
});
