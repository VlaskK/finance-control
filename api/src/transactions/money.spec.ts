import { BadRequestException } from '@nestjs/common';
import { deriveMoney, round2 } from './money';

describe('round2', () => {
  it('округляет до копеек', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(99.994)).toBe(99.99);
  });
});

describe('deriveMoney — расходы и доходы', () => {
  it('рублёвая трата: baseAmount = amount, без курса', () => {
    expect(deriveMoney({ amount: 200, currency: 'RUB', type: 'expense' })).toEqual({
      baseAmount: '200.00',
      rate: null,
      toAmount: null,
    });
  });

  it('валютная трата: baseAmount = amount × rate', () => {
    expect(
      deriveMoney({ amount: 100, currency: 'USD', type: 'expense', rate: 90.5 }),
    ).toEqual({ baseAmount: '9050.00', rate: '90.5', toAmount: null });
  });

  it('валютная трата без курса → ошибка с называнием валюты', () => {
    expect(() => deriveMoney({ amount: 100, currency: 'USD', type: 'expense' })).toThrow(
      /1 USD/,
    );
  });

  it('нулевой или отрицательный курс → ошибка', () => {
    expect(() =>
      deriveMoney({ amount: 100, currency: 'USD', type: 'expense', rate: 0 }),
    ).toThrow(BadRequestException);
    expect(() =>
      deriveMoney({ amount: 100, currency: 'USD', type: 'expense', rate: -90 }),
    ).toThrow(BadRequestException);
  });

  it('валютный доход конвертируется так же', () => {
    expect(
      deriveMoney({ amount: 1000, currency: 'USD', type: 'income', rate: 90 }),
    ).toEqual({ baseAmount: '90000.00', rate: '90', toAmount: null });
  });

  it('счёт-получатель у не-перевода → ошибка', () => {
    expect(() =>
      deriveMoney({ amount: 100, currency: 'RUB', type: 'expense', toCurrency: 'RUB' }),
    ).toThrow(/только для переводов/);
  });
});

describe('deriveMoney — переводы', () => {
  it('перевод без счёта-получателя (вне счетов): только списание', () => {
    expect(deriveMoney({ amount: 5000, currency: 'RUB', type: 'transfer' })).toEqual({
      baseAmount: '5000.00',
      rate: null,
      toAmount: null,
    });
  });

  it('одинаковые валюты: toAmount = amount', () => {
    expect(
      deriveMoney({ amount: 5000, currency: 'RUB', type: 'transfer', toCurrency: 'RUB' }),
    ).toEqual({ baseAmount: '5000.00', rate: null, toAmount: '5000.00' });
  });

  it('RUB → валюта: toAmount = amount / rate', () => {
    expect(
      deriveMoney({
        amount: 9000,
        currency: 'RUB',
        type: 'transfer',
        toCurrency: 'USD',
        rate: 90,
      }),
    ).toEqual({ baseAmount: '9000.00', rate: '90', toAmount: '100.00' });
  });

  it('RUB → валюта без курса → ошибка с валютой получателя', () => {
    expect(() =>
      deriveMoney({ amount: 9000, currency: 'RUB', type: 'transfer', toCurrency: 'USD' }),
    ).toThrow(/1 USD/);
  });

  it('валюта → RUB: toAmount = baseAmount', () => {
    expect(
      deriveMoney({
        amount: 100,
        currency: 'USD',
        type: 'transfer',
        toCurrency: 'RUB',
        rate: 91,
      }),
    ).toEqual({ baseAmount: '9100.00', rate: '91', toAmount: '9100.00' });
  });

  it('валюта → валюта: без явного toAmount — ошибка', () => {
    expect(() =>
      deriveMoney({
        amount: 100,
        currency: 'USD',
        type: 'transfer',
        toCurrency: 'EUR',
        rate: 90,
      }),
    ).toThrow(/сумму зачисления/);
  });

  it('явный toAmount перекрывает вычисленный', () => {
    expect(
      deriveMoney({
        amount: 9000,
        currency: 'RUB',
        type: 'transfer',
        toCurrency: 'USD',
        rate: 90,
        toAmount: 99.5,
      }),
    ).toEqual({ baseAmount: '9000.00', rate: '90', toAmount: '99.50' });
  });

  it('явный неположительный toAmount → ошибка', () => {
    expect(() =>
      deriveMoney({
        amount: 9000,
        currency: 'RUB',
        type: 'transfer',
        toCurrency: 'USD',
        rate: 90,
        toAmount: 0,
      }),
    ).toThrow(/больше нуля/);
  });

  it('округление зачисления до копеек', () => {
    expect(
      deriveMoney({
        amount: 1000,
        currency: 'RUB',
        type: 'transfer',
        toCurrency: 'USD',
        rate: 93,
      }).toAmount,
    ).toBe('10.75'); // 1000/93 = 10.7526…
  });
});
