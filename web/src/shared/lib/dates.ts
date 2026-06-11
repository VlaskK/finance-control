import type { Period } from '../api/types';

export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function currentMonthIso(): string {
  return todayIso().slice(0, 7);
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const dayShortFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayYearFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

function utc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

// Заголовок группы в истории (FR-B1): сегодня/вчера/дата
export function formatDayHeading(isoDate: string): string {
  const today = todayIso();
  if (isoDate === today) return 'Сегодня';
  const yesterday = shiftDays(today, -1);
  if (isoDate === yesterday) return 'Вчера';
  const withYear = isoDate.slice(0, 4) !== today.slice(0, 4);
  return capitalize((withYear ? dayYearFmt : dayFmt).format(utc(isoDate)));
}

export function formatMonth(isoMonth: string): string {
  return capitalize(monthFmt.format(utc(`${isoMonth}-01`)));
}

export function shiftDays(isoDate: string, days: number): string {
  const d = utc(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function shiftMonths(isoMonth: string, delta: number): string {
  const [y, m] = isoMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// Навигация по периодам (FR-D1)
export function shiftPeriod(period: Period, isoDate: string, delta: number): string {
  switch (period) {
    case 'day':
      return shiftDays(isoDate, delta);
    case 'week':
      return shiftDays(isoDate, delta * 7);
    case 'month':
      return `${shiftMonths(isoDate.slice(0, 7), delta)}-01`;
    case 'year': {
      const y = Number(isoDate.slice(0, 4)) + delta;
      return `${y}-01-01`;
    }
  }
}

// Подпись текущего периода в шапке графиков (FR-D1)
export function periodTitle(period: Period, isoDate: string): string {
  switch (period) {
    case 'day':
      return capitalize(dayYearFmt.format(utc(isoDate)));
    case 'week': {
      const dow = (utc(isoDate).getUTCDay() + 6) % 7;
      const from = shiftDays(isoDate, -dow);
      const to = shiftDays(from, 6);
      return `${dayShortFmt.format(utc(from))} — ${dayYearFmt.format(utc(to))}`;
    }
    case 'month':
      return formatMonth(isoDate.slice(0, 7));
    case 'year':
      return isoDate.slice(0, 4);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
