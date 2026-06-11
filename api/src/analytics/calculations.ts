// Чистые функции расчётов §6.2 (CALC-3…CALC-6).
// Вынесены из сервиса прицельно под юнит-тесты (NFR-T1).

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// CALC-3 — индекс трат категории (динамика, НЕ инфляция).
// База — первый период диапазона; если в базе нулевые траты, индекс не определён.
export function spendIndex(values: number[]): (number | null)[] {
  const base = values[0];
  if (!base) return values.map(() => null);
  return values.map((v) => round2((100 * v) / base));
}

// CALC-4 — скользящее среднее за `window` периодов (текущий + предыдущие).
// null на входе (нет данных за период) не участвует в среднем.
export function movingAverage(
  values: (number | null)[],
  window = 3,
): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    const known = slice.filter((v): v is number => v !== null);
    if (!known.length) return null;
    return round2(known.reduce((a, b) => a + b, 0) / known.length);
  });
}

// CALC-5 — разложение изменения трат: ΔE ≈ Δn·AvgTicket(0) + n(0)·ΔAvgTicket.
// cross — взаимный эффект (Δn·ΔAvgTicket), чтобы сумма компонент сходилась с ΔE точно.
export interface Decomposition {
  freq: number;
  ticket: number;
  cross: number;
  total: number;
}

export function decomposeChange(
  base: { count: number; avgTicket: number },
  current: { count: number; avgTicket: number },
): Decomposition {
  const dn = current.count - base.count;
  const dt = current.avgTicket - base.avgTicket;
  const freq = dn * base.avgTicket;
  const ticket = base.count * dt;
  const cross = dn * dt;
  return {
    freq: round2(freq),
    ticket: round2(ticket),
    cross: round2(cross),
    total: round2(freq + ticket + cross),
  };
}

// CALC-6 — индекс личной инфляции (Ласпейрес по фикс-позициям, BR-12).
// Пропуски цен заполняются переносом последней известной цены вперёд;
// до первого наблюдения — первой известной ценой (цена считается неизменной).
export interface FixedItemPrices {
  id: string;
  name: string;
  prices: (number | null)[]; // по периодам диапазона
}

export interface LaspeyresResult {
  cpi: (number | null)[];
  items: { id: string; name: string; basePrice: number; weight: number }[];
}

export function fillPrices(prices: (number | null)[]): number[] | null {
  const firstKnown = prices.find((p): p is number => p !== null);
  if (firstKnown === undefined) return null;
  let last = firstKnown;
  return prices.map((p) => {
    if (p !== null) last = p;
    return last;
  });
}

export function laspeyresIndex(items: FixedItemPrices[]): LaspeyresResult {
  const filled = items
    .map((item) => ({ ...item, filled: fillPrices(item.prices) }))
    .filter((item): item is typeof item & { filled: number[] } => item.filled !== null);

  if (!filled.length) {
    const len = items[0]?.prices.length ?? 0;
    return { cpi: Array.from({ length: len }, () => null), items: [] };
  }

  const baseSum = filled.reduce((acc, item) => acc + item.filled[0], 0);
  const meta = filled.map((item) => ({
    id: item.id,
    name: item.name,
    basePrice: round2(item.filled[0]),
    weight: round2(item.filled[0] / baseSum),
  }));

  const len = filled[0].filled.length;
  const cpi = Array.from({ length: len }, (_, t) => {
    // CPI(t) = 100 · Σ w_i · (p_i,t / p_i,0); веса не округляем, чтобы Σw_i = 1
    const value = filled.reduce(
      (acc, item) => acc + (item.filled[0] / baseSum) * (item.filled[t] / item.filled[0]),
      0,
    );
    return round2(100 * value);
  });

  return { cpi, items: meta };
}

// Изменение в % с лагом: м/м (lag=1) и г/г (lag=12) по CALC-6
export function percentChange(
  series: (number | null)[],
  lag: number,
): (number | null)[] {
  return series.map((value, i) => {
    const prev = i >= lag ? series[i - lag] : null;
    if (value === null || prev === null || prev === 0) return null;
    return round2((value / prev - 1) * 100);
  });
}
