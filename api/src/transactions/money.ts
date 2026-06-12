import { BadRequestException } from '@nestjs/common';

// Вывод производных денежных полей операции. Вся валютная арифметика и округление — здесь.
// rate — рублей за 1 единицу валюты счёта списания; baseAmount — рублёвый эквивалент (для
// аналитики и бюджетов); toAmount — зачислено на счёт-получатель в его валюте.

export const BASE_CURRENCY = 'RUB';

export interface MoneyInput {
  amount: number;
  /** Валюта счёта списания. */
  currency: string;
  /** Тип операции (от категории, BR-10). */
  type: 'expense' | 'transfer' | 'income';
  rate?: number | null;
  /** Валюта счёта-получателя; undefined — перевод без счёта-получателя. */
  toCurrency?: string | null;
  /** Явно заданная сумма зачисления (перекрывает вычисленную). */
  toAmount?: number | null;
}

export interface DerivedMoney {
  /** Строки с двумя знаками — формат колонок numeric(12,2). */
  baseAmount: string;
  rate: string | null;
  toAmount: string | null;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function deriveMoney(input: MoneyInput): DerivedMoney {
  const { amount, currency, type, toCurrency } = input;
  const rate = input.rate ?? null;
  const isFx = currency !== BASE_CURRENCY;

  if (rate !== null && rate <= 0) {
    throw new BadRequestException('Курс должен быть больше нуля');
  }
  if (isFx && rate === null) {
    throw new BadRequestException(
      `Укажите курс: сколько рублей за 1 ${currency}`,
    );
  }
  if (toCurrency != null && type !== 'transfer') {
    throw new BadRequestException('Счёт-получатель доступен только для переводов');
  }

  const baseAmount = isFx ? round2(amount * rate!) : round2(amount);

  // Сумма зачисления — только для переводов со счётом-получателем.
  let toAmount: number | null = null;
  if (type === 'transfer' && toCurrency != null) {
    if (input.toAmount != null) {
      if (input.toAmount <= 0) {
        throw new BadRequestException('Сумма зачисления должна быть больше нуля');
      }
      toAmount = round2(input.toAmount);
    } else if (toCurrency === currency) {
      toAmount = round2(amount);
    } else if (currency === BASE_CURRENCY) {
      // RUB → валюта: rate обязателен (рублей за 1 единицу валюты получателя)
      if (rate === null) {
        throw new BadRequestException(
          `Укажите курс: сколько рублей за 1 ${toCurrency}`,
        );
      }
      toAmount = round2(amount / rate);
    } else if (toCurrency === BASE_CURRENCY) {
      toAmount = baseAmount;
    } else {
      throw new BadRequestException(
        'Для перевода между валютными счетами укажите сумму зачисления',
      );
    }
  }

  return {
    baseAmount: baseAmount.toFixed(2),
    rate: rate !== null ? String(rate) : null,
    toAmount: toAmount !== null ? toAmount.toFixed(2) : null,
  };
}
