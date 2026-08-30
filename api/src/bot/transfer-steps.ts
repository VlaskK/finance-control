// Чистая логика wizard'а перевода: какой шаг следующий и в какой валюте спрашивать курс.
// Правила зеркалят deriveMoney (transactions/money.ts):
//  - источник в валюте (не RUB) → нужен курс «₽ за 1 единицу валюты ИСТОЧНИКА»;
//  - RUB → валютный счёт → нужен курс «₽ за 1 единицу валюты ПОЛУЧАТЕЛЯ» (toAmount = amount/rate);
//  - валюта → другая валюта → курс источника + явная сумма зачисления;
//  - одинаковые валюты / валюта → RUB — сумма зачисления выводится автоматически.

import { type TransferDraft } from './session';

export type TransferStep =
  | 'category'
  | 'from'
  | 'to'
  | 'amount'
  | 'rate'
  | 'toAmount'
  | 'confirm';

const BASE = 'RUB';

// Валюта, за 1 единицу которой спрашиваем курс в рублях; null — курс не нужен.
export function rateQuoteCurrency(d: TransferDraft): string | null {
  if (d.fromCurrency && d.fromCurrency !== BASE) return d.fromCurrency;
  if (d.toCurrency && d.toCurrency !== BASE) return d.toCurrency;
  return null;
}

// Нужна ли явная сумма зачисления (валюта → другая валюта).
export function needsToAmount(d: TransferDraft): boolean {
  return Boolean(
    d.fromCurrency &&
      d.fromCurrency !== BASE &&
      d.toCurrency &&
      d.toCurrency !== BASE &&
      d.toCurrency !== d.fromCurrency,
  );
}

export function nextTransferStep(d: TransferDraft): TransferStep {
  // undefined — категорию ещё не спрашивали; null = «без категории» — выбор сделан
  if (d.categoryId === undefined) return 'category';
  if (!d.fromId) return 'from';
  if (d.toId === undefined) return 'to'; // null = «вне счетов» — выбор сделан
  if (d.amount == null) return 'amount';
  if (rateQuoteCurrency(d) !== null && d.rate == null) return 'rate';
  if (needsToAmount(d) && d.toAmount == null) return 'toAmount';
  return 'confirm';
}
