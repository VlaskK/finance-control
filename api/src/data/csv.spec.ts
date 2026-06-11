import {
  mapHeaders,
  parseAmount,
  parseCsv,
  parseDateCell,
  parseTypeCell,
  toCsv,
} from './csv';

describe('parseCsv (FR-G2)', () => {
  it('разбирает ; с кавычками и переводами строк в полях', () => {
    const rows = parseCsv('a;b\r\n"x;y";"с ""кавычками"""\r\n1;2');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x;y', 'с "кавычками"'],
      ['1', '2'],
    ]);
  });

  it('определяет запятую как разделитель по заголовку', () => {
    expect(parseCsv('date,amount\n2026-01-01,500')).toEqual([
      ['date', 'amount'],
      ['2026-01-01', '500'],
    ]);
  });

  it('пропускает пустые строки и срезает BOM', () => {
    expect(parseCsv('﻿a;b\n\n1;2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('toCsv (FR-G1)', () => {
  it('экранирует разделители и кавычки, null — пустая ячейка', () => {
    expect(toCsv([['a;b', 'с "к"', null, 12.5]])).toBe('"a;b";"с ""к""";;12.5');
  });

  it('круговая совместимость с parseCsv', () => {
    const rows = [
      ['date', 'label'],
      ['2026-01-01', 'кофе; с собой'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('parseAmount', () => {
  it.each([
    ['1234.56', 1234.56],
    ['1 234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['₽ 500', 500],
    ['0', 0],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it('мусор → null', () => {
    expect(parseAmount('—')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});

describe('parseDateCell', () => {
  it.each([
    ['2026-06-11', '2026-06-11'],
    ['11.06.2026', '2026-06-11'],
    ['1.6.2026', '2026-06-01'],
    ['11/06/2026', '2026-06-11'],
  ])('%s → %s', (raw, expected) => {
    expect(parseDateCell(raw)).toBe(expected);
  });

  it('несуществующая дата и мусор → null', () => {
    expect(parseDateCell('2026-02-30')).toBeNull();
    expect(parseDateCell('вчера')).toBeNull();
  });
});

describe('mapHeaders', () => {
  it('понимает русские и английские заголовки в любом регистре', () => {
    expect(mapHeaders(['Дата', 'Сумма', 'Категория', 'Подкатегория', 'note'])).toEqual({
      date: 0,
      amount: 1,
      category: 2,
      subcategory: 3,
      note: 4,
    });
  });
});

describe('parseTypeCell', () => {
  it('расход/перевод/доход и английские варианты', () => {
    expect(parseTypeCell('Расход')).toBe('expense');
    expect(parseTypeCell('перевод')).toBe('transfer');
    expect(parseTypeCell('income')).toBe('income');
    expect(parseTypeCell('???')).toBeNull();
  });
});
