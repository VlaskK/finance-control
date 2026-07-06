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

// Дата из «05.07», «05.07.2026» или «2026-07-05» → ISO; год по умолчанию — текущий.
export function parseDate(text: string, todayIso = new Date().toISOString().slice(0, 10)): string | null {
  const t = text.trim();

  const isoMatch = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dotMatch = t.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);

  let year: number;
  let month: number;
  let day: number;
  if (isoMatch) {
    [year, month, day] = [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])];
  } else if (dotMatch) {
    day = Number(dotMatch[1]);
    month = Number(dotMatch[2]);
    year = dotMatch[3] ? Number(dotMatch[3]) : Number(todayIso.slice(0, 4));
  } else {
    return null;
  }

  // Валидность календарной даты: Date не должен «перекатить» месяц (31.02 → 03.03).
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

// Диапазон «01.06 30.06» / «01.06-30.06» / «2026-06-01 2026-06-30» → {from, to} ISO.
// Даты в любом порядке — переставим.
export function parseDateRange(
  text: string,
  todayIso = new Date().toISOString().slice(0, 10),
): { from: string; to: string } | null {
  const tokens = text
    .trim()
    .split(/\s*[–—]\s*|\s+-\s+|\s+|(?<=\d)-(?=\d{1,2}\.)/)
    .filter(Boolean);
  if (tokens.length !== 2) return null;

  const a = parseDate(tokens[0], todayIso);
  const b = parseDate(tokens[1], todayIso);
  if (!a || !b) return null;
  return a <= b ? { from: a, to: b } : { from: b, to: a };
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
