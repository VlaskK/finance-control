import { CB, cb, parseCb } from './callbacks';

const UUID = 'db086d6c-ab5f-4009-941b-767d3b8496a0';

describe('cb / parseCb', () => {
  it('roundtrip: собранное разбирается обратно', () => {
    const data = cb(CB.category, UUID);
    expect(parseCb(data)).toEqual({ ns: 'c', args: [UUID] });
  });

  it('несколько аргументов', () => {
    expect(parseCb(cb('e', UUID, 'xy'))).toEqual({ ns: 'e', args: [UUID, 'xy'] });
  });

  it('одиночный namespace без аргументов', () => {
    expect(parseCb('g')).toEqual({ ns: 'g', args: [] });
  });

  it('s:- (без подкатегории)', () => {
    expect(parseCb(cb(CB.subcategory, '-'))).toEqual({ ns: 's', args: ['-'] });
  });

  it('бросает при превышении 64 байт (два UUID не влезают)', () => {
    expect(() => cb('e', UUID, UUID)).toThrow(/64/);
  });

  it('лимит считается в байтах, не символах (кириллица — 2 байта)', () => {
    expect(() => cb('ы'.repeat(33))).toThrow(/64/);
    expect(cb('y'.repeat(33))).toBe('y'.repeat(33));
  });
});
