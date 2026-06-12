// Кэш форматтеров по валюте; невалидный код валюты не должен ронять рендер
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let fmt = formatters.get(currency);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch {
      fmt = new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }
    formatters.set(currency, fmt);
  }
  return fmt;
}

export function formatMoney(value: number | string, currency = 'RUB'): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return formatterFor(currency).format(n);
}

// '1 234,56' из поля ввода → 1234.56; мусор → null (FR-A6)
export function parseAmountInput(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
