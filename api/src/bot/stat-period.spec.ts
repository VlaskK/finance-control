import { decodePeriod, encodePeriod, resolvePeriod, resolvePreset } from './stat-period';

const TODAY = '2026-07-15'; // среда

describe('resolvePreset', () => {
  it('день и вчера — одна дата', () => {
    expect(resolvePreset('d', TODAY)).toEqual({ from: TODAY, to: TODAY, title: 'сегодня' });
    expect(resolvePreset('y', TODAY)).toMatchObject({ from: '2026-07-14', to: '2026-07-14' });
  });

  it('неделя с понедельника, месяц и год — календарные границы', () => {
    expect(resolvePreset('w', TODAY)).toMatchObject({ from: '2026-07-13', to: '2026-07-19' });
    expect(resolvePreset('m', TODAY)).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
    expect(resolvePreset('yr', TODAY)).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('прошлый месяц — целиком, включая переход через год', () => {
    expect(resolvePreset('pm', TODAY)).toMatchObject({ from: '2026-06-01', to: '2026-06-30' });
    expect(resolvePreset('pm', '2026-01-10')).toMatchObject({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('«всё время» — без границ', () => {
    expect(resolvePreset('a', TODAY)).toEqual({ from: null, to: null, title: 'всё время' });
  });
});

describe('resolvePeriod', () => {
  it('диапазон отдаётся как есть, заголовок — обе даты', () => {
    expect(resolvePeriod({ kind: 'range', from: '2026-06-01', to: '2026-06-30' }, TODAY)).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
      title: '2026-06-01 — 2026-06-30',
    });
  });
});

describe('encodePeriod / decodePeriod', () => {
  it('пресет и диапазон ходят туда-обратно', () => {
    const range = { kind: 'range', from: '2026-06-01', to: '2026-06-30' } as const;
    expect(encodePeriod(range)).toBe('r2026060120260630');
    expect(decodePeriod(encodePeriod(range))).toEqual(range);

    const preset = { kind: 'preset', preset: 'pm' } as const;
    expect(encodePeriod(preset)).toBe('pm');
    expect(decodePeriod('pm')).toEqual(preset);
  });

  it('токен диапазона укладывается рядом с UUID в 64 байта', () => {
    const data = `ct:c:db086d6c-ab5f-4009-941b-767d3b8496a0:${encodePeriod({
      kind: 'range',
      from: '2026-06-01',
      to: '2026-06-30',
    })}`;
    expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('неизвестный токен — месяц', () => {
    expect(decodePeriod('zzz')).toEqual({ kind: 'preset', preset: 'm' });
    expect(decodePeriod('')).toEqual({ kind: 'preset', preset: 'm' });
  });
});
