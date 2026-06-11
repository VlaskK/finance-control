const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return rub.format(n);
}

// '1 234,56' из поля ввода → 1234.56; мусор → null (FR-A6)
export function parseAmountInput(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
