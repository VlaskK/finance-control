import { parseExpenseInput, parseIncomeInput, parsePositiveNumber } from './parse';

describe('parseIncomeInput', () => {
  it('«+50000 зарплата» → доход', () => {
    expect(parseIncomeInput('+50000 зарплата')).toEqual({
      amount: 50000,
      label: 'зарплата',
      note: null,
    });
  });

  it('пробелы перед плюсом допустимы', () => {
    expect(parseIncomeInput('  +100 кэшбек')?.amount).toBe(100);
  });

  it('без плюса — не доход', () => {
    expect(parseIncomeInput('50000 зарплата')).toBeNull();
  });

  it('плюс без числа → null', () => {
    expect(parseIncomeInput('+зарплата')).toBeNull();
  });
});

describe('parsePositiveNumber', () => {
  it('число с запятой', () => {
    expect(parsePositiveNumber('90,5')).toBe(90.5);
  });

  it('отклоняет ноль, отрицательные и мусор', () => {
    expect(parsePositiveNumber('0')).toBeNull();
    expect(parsePositiveNumber('-5')).toBeNull();
    expect(parsePositiveNumber('абв')).toBeNull();
  });
});

describe('parseExpenseInput', () => {
  it('метка перед суммой', () => {
    expect(parseExpenseInput('кофе 200')).toEqual({ amount: 200, label: 'кофе', note: null });
  });

  it('сумма перед меткой', () => {
    expect(parseExpenseInput('200 кофе')).toEqual({ amount: 200, label: 'кофе', note: null });
  });

  it('дробная часть через запятую и многословная метка', () => {
    expect(parseExpenseInput('200,50 такси домой')).toEqual({
      amount: 200.5,
      label: 'такси домой',
      note: null,
    });
  });

  it('дробная часть через точку', () => {
    expect(parseExpenseInput('149.99 обед')).toEqual({
      amount: 149.99,
      label: 'обед',
      note: null,
    });
  });

  it('только сумма без метки', () => {
    expect(parseExpenseInput('500')).toEqual({ amount: 500, label: null, note: null });
  });

  it('текст без числа → null', () => {
    expect(parseExpenseInput('просто текст')).toBeNull();
  });

  it('пустая строка → null', () => {
    expect(parseExpenseInput('   ')).toBeNull();
  });

  it('ноль не является валидной суммой', () => {
    expect(parseExpenseInput('0 кофе')).toBeNull();
  });

  it('метка обрезается до 120 символов', () => {
    const long = 'a'.repeat(200);
    const result = parseExpenseInput(`100 ${long}`);
    expect(result?.label).toHaveLength(120);
  });
});
