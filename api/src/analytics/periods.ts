// Чистые функции работы с периодами (FR-D1, FR-E1).
// Всё в UTC: occurred_at — календарная дата без времени.

export type Period = 'day' | 'week' | 'month' | 'year';

function d(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

// Границы периода, содержащего дату (неделя начинается с понедельника)
export function periodRange(period: Period, dateIso: string): { from: string; to: string } {
  const date = d(dateIso);
  switch (period) {
    case 'day':
      return { from: dateIso, to: dateIso };
    case 'week': {
      const dow = (date.getUTCDay() + 6) % 7; // Пн = 0
      const from = addDays(date, -dow);
      return { from: iso(from), to: iso(addDays(from, 6)) };
    }
    case 'month': {
      const y = date.getUTCFullYear();
      const m = date.getUTCMonth();
      return {
        from: iso(new Date(Date.UTC(y, m, 1))),
        to: iso(new Date(Date.UTC(y, m + 1, 0))),
      };
    }
    case 'year': {
      const y = date.getUTCFullYear();
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
  }
}

// FR-D3 — корзины временного ряда внутри периода:
// day → один день, week/month → дни, year → месяцы 'YYYY-MM'
export function periodBuckets(period: Period, dateIso: string): string[] {
  const { from, to } = periodRange(period, dateIso);
  if (period === 'day') return [from];
  if (period === 'year') {
    const y = from.slice(0, 4);
    return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  }
  const buckets: string[] = [];
  for (let cur = d(from); cur <= d(to); cur = addDays(cur, 1)) buckets.push(iso(cur));
  return buckets;
}

// Список месяцев 'YYYY-MM' включительно
export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const result: string[] = [];
  let [y, m] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

// Список лет 'YYYY' включительно
export function yearsBetween(fromMonth: string, toMonth: string): string[] {
  const fromY = Number(fromMonth.slice(0, 4));
  const toY = Number(toMonth.slice(0, 4));
  const result: string[] = [];
  for (let y = fromY; y <= toY; y++) result.push(String(y));
  return result;
}

// Границы дат для диапазона месяцев (для SQL between)
export function monthRangeBounds(fromMonth: string, toMonth: string): { from: string; to: string } {
  const [ty, tm] = toMonth.split('-').map(Number);
  return {
    from: `${fromMonth}-01`,
    to: iso(new Date(Date.UTC(ty, tm, 0))),
  };
}
