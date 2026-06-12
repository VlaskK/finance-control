import { round2 } from '../transactions/money';

// Чистая логика начисления процентов по дням. Никакого ввода-вывода и истории ставок —
// ставка уже разложена по дням (dailyRate), движения пользователя — userDelta за день.

export interface AccrualDay {
  date: string; // YYYY-MM-DD
  dailyRate: number; // доля за день, напр. 0.16/365
  userDelta: number; // нетто пользовательских операций за этот день (в валюте счёта)
}

export interface AccrualResult {
  date: string;
  interest: number;
  balanceAfter: number;
}

// Процент дня считается на остаток на начало дня (конец предыдущего); затем к остатку
// прибавляются и процент, и движения пользователя — следующий день стартует с нового остатка
// (сложный процент выходит сам). Отрицательный/нулевой остаток процента не даёт.
export function accrueDays(input: {
  openingBalance: number;
  days: AccrualDay[];
}): AccrualResult[] {
  let balance = input.openingBalance;
  const result: AccrualResult[] = [];
  for (const day of input.days) {
    const interest = balance > 0 ? round2(balance * day.dailyRate) : 0;
    balance = round2(balance + interest + day.userDelta);
    result.push({ date: day.date, interest, balanceAfter: balance });
  }
  return result;
}

// Перечень дат [from+1 .. to-1] (только завершённые дни; сегодня = to не включаем).
export function completedDaysBetween(fromExclusive: string, toExclusive: string): string[] {
  const days: string[] = [];
  const d = new Date(`${fromExclusive}T00:00:00Z`);
  const end = new Date(`${toExclusive}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d < end) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

// Годовая ставка (%) → дневная доля
export function dailyRateFromAnnual(annualPercent: number): number {
  return annualPercent / 100 / 365;
}
