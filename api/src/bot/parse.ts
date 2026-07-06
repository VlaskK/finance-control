// Разбор свободного текста вроде «кофе 200» / «200 такси домой» в трату.
// Сумма — первое число в строке (точка или запятая как разделитель дробной части).
// Остаток строки становится меткой (label, ≤120 симв. как в createTransactionSchema).

export interface ParsedExpense {
  amount: number;
  label: string | null;
  note: string | null;
}

const NUMBER_RE = /\d+(?:[.,]\d+)?/;

// Доход — тот же формат, но с ведущим «+»: «+50000 зарплата».
export function parseIncomeInput(text: string): ParsedExpense | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('+')) return null;
  return parseExpenseInput(trimmed.slice(1));
}

// Положительное число из текстового ответа (курс, сумма перевода); запятая допустима.
export function parsePositiveNumber(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseExpenseInput(text: string): ParsedExpense | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = trimmed.match(NUMBER_RE);
  if (!match) return null;

  const amount = Number(match[0].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // Убираем найденное число из строки — остальное это описание траты.
  const rest = (trimmed.slice(0, match.index) + trimmed.slice(match.index! + match[0].length))
    .replace(/\s+/g, ' ')
    .trim();

  const label = rest ? rest.slice(0, 120) : null;
  return { amount, label, note: null };
}
