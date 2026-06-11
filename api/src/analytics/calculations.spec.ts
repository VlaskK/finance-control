import {
  decomposeChange,
  fillPrices,
  laspeyresIndex,
  movingAverage,
  percentChange,
  spendIndex,
} from './calculations';

// NFR-T1 — формулы §6.2 как первые кандидаты на юнит-тесты

describe('CALC-3 spendIndex', () => {
  it('база = 100, рост и падение в процентах от базы', () => {
    expect(spendIndex([200, 250, 150])).toEqual([100, 125, 75]);
  });

  it('нулевая база — индекс не определён', () => {
    expect(spendIndex([0, 100, 200])).toEqual([null, null, null]);
  });

  it('нулевой период внутри ряда даёт индекс 0', () => {
    expect(spendIndex([100, 0, 50])).toEqual([100, 0, 50]);
  });
});

describe('CALC-4 movingAverage (окно 3)', () => {
  it('усредняет текущий и два предыдущих периода', () => {
    expect(movingAverage([300, 600, 900, 1200])).toEqual([300, 450, 600, 900]);
  });

  it('пропуски (null) не участвуют в среднем', () => {
    expect(movingAverage([300, null, 600])).toEqual([300, 300, 450]);
  });

  it('полностью пустое окно остаётся null', () => {
    expect(movingAverage([null, null, 300])).toEqual([null, null, 300]);
  });
});

describe('CALC-5 decomposeChange', () => {
  it('ΔE = Δn·avg₀ + n₀·Δavg + Δn·Δavg, сумма сходится точно', () => {
    // база: 10 покупок по 500 = 5000; стало: 12 покупок по 600 = 7200
    const d = decomposeChange({ count: 10, avgTicket: 500 }, { count: 12, avgTicket: 600 });
    expect(d.freq).toBe(1000); // 2 · 500
    expect(d.ticket).toBe(1000); // 10 · 100
    expect(d.cross).toBe(200); // 2 · 100
    expect(d.total).toBe(2200); // 7200 − 5000
  });

  it('чистый рост цен — вся дельта в компоненте «чек»', () => {
    const d = decomposeChange({ count: 10, avgTicket: 500 }, { count: 10, avgTicket: 550 });
    expect(d.freq).toBe(0);
    expect(d.ticket).toBe(500);
    expect(d.cross).toBe(0);
  });
});

describe('CALC-6 laspeyresIndex', () => {
  it('рост цены одной позиции взвешивается её долей в базовой корзине', () => {
    // аренда 30000 (вес 0.75), спортзал 10000 (вес 0.25)
    const { cpi, items } = laspeyresIndex([
      { id: 'a', name: 'Аренда', prices: [30000, 30000, 33000] },
      { id: 'b', name: 'Спортзал', prices: [10000, 10000, 10000] },
    ]);
    expect(items.map((i) => i.weight)).toEqual([0.75, 0.25]);
    expect(cpi).toEqual([100, 100, 107.5]); // 0.75·110 + 0.25·100
  });

  it('пропуск цены переносится вперёд (цена не менялась)', () => {
    const { cpi } = laspeyresIndex([{ id: 'a', name: 'Подписка', prices: [500, null, 600] }]);
    expect(cpi).toEqual([100, 100, 120]);
  });

  it('позиция без наблюдений исключается; пустой набор — индекс недоступен', () => {
    const { cpi, items } = laspeyresIndex([
      { id: 'a', name: 'Пустая', prices: [null, null] },
    ]);
    expect(items).toEqual([]);
    expect(cpi).toEqual([null, null]);
  });

  it('Σ вкладов при неизменных ценах остаётся 100', () => {
    const { cpi } = laspeyresIndex([
      { id: 'a', name: 'А', prices: [333, 333] },
      { id: 'b', name: 'Б', prices: [667, 667] },
    ]);
    expect(cpi).toEqual([100, 100]);
  });
});

describe('fillPrices', () => {
  it('до первого наблюдения — первая известная цена, дальше перенос вперёд', () => {
    expect(fillPrices([null, 100, null, 120])).toEqual([100, 100, 100, 120]);
  });

  it('без наблюдений — null', () => {
    expect(fillPrices([null, null])).toBeNull();
  });
});

describe('percentChange (м/м и г/г из CALC-6)', () => {
  it('м/м (lag=1)', () => {
    expect(percentChange([100, 110, 99], 1)).toEqual([null, 10, -10]);
  });

  it('г/г (lag=12): до 13-го месяца не определено', () => {
    const series = [100, ...Array.from({ length: 11 }, () => 100), 108];
    const yoy = percentChange(series, 12);
    expect(yoy[11]).toBeNull();
    expect(yoy[12]).toBe(8);
  });
});
