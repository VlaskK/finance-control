import { type TransferDraft } from './session';
import { needsToAmount, nextTransferStep, rateQuoteCurrency } from './transfer-steps';

// Черновик по шагам: категория и счета уже выбраны.
function draft(partial: Partial<TransferDraft>): TransferDraft {
  return { mode: 'transfer', ...partial };
}

const base = {
  categoryId: 'cat',
  fromId: 'from',
  toId: 'to' as string | null,
};

describe('nextTransferStep — порядок шагов', () => {
  it('пустой черновик → категория', () => {
    expect(nextTransferStep(draft({}))).toBe('category');
  });

  it('категория есть → откуда', () => {
    expect(nextTransferStep(draft({ categoryId: 'cat' }))).toBe('from');
  });

  it('toId undefined → куда; toId null («вне счетов») — выбор сделан', () => {
    expect(nextTransferStep(draft({ categoryId: 'cat', fromId: 'f', fromCurrency: 'RUB' }))).toBe('to');
    expect(
      nextTransferStep(
        draft({ categoryId: 'cat', fromId: 'f', fromCurrency: 'RUB', toId: null, toCurrency: null }),
      ),
    ).toBe('amount');
  });
});

describe('nextTransferStep — валютная лесенка', () => {
  it('RUB → RUB: после суммы сразу подтверждение', () => {
    const d = draft({ ...base, fromCurrency: 'RUB', toCurrency: 'RUB', amount: 100 });
    expect(nextTransferStep(d)).toBe('confirm');
  });

  it('USD → RUB: нужен курс источника, зачисление автоматом', () => {
    const d = draft({ ...base, fromCurrency: 'USD', toCurrency: 'RUB', amount: 100 });
    expect(nextTransferStep(d)).toBe('rate');
    expect(rateQuoteCurrency(d)).toBe('USD');
    expect(nextTransferStep({ ...d, rate: 90 })).toBe('confirm');
  });

  it('RUB → USD: нужен курс валюты ПОЛУЧАТЕЛЯ (toAmount = amount/rate)', () => {
    const d = draft({ ...base, fromCurrency: 'RUB', toCurrency: 'USD', amount: 9000 });
    expect(nextTransferStep(d)).toBe('rate');
    expect(rateQuoteCurrency(d)).toBe('USD');
    expect(nextTransferStep({ ...d, rate: 90 })).toBe('confirm');
    expect(needsToAmount(d)).toBe(false);
  });

  it('USD → EUR: курс источника + явная сумма зачисления', () => {
    const d = draft({ ...base, fromCurrency: 'USD', toCurrency: 'EUR', amount: 100 });
    expect(rateQuoteCurrency(d)).toBe('USD');
    expect(needsToAmount(d)).toBe(true);
    expect(nextTransferStep(d)).toBe('rate');
    expect(nextTransferStep({ ...d, rate: 90 })).toBe('toAmount');
    expect(nextTransferStep({ ...d, rate: 90, toAmount: 85 })).toBe('confirm');
  });

  it('USD → USD: курс источника, зачисление автоматом (равно сумме)', () => {
    const d = draft({ ...base, fromCurrency: 'USD', toCurrency: 'USD', amount: 100 });
    expect(needsToAmount(d)).toBe(false);
    expect(nextTransferStep(d)).toBe('rate');
    expect(nextTransferStep({ ...d, rate: 90 })).toBe('confirm');
  });

  it('USD → вне счетов: только курс источника', () => {
    const d = draft({
      ...base,
      toId: null,
      fromCurrency: 'USD',
      toCurrency: null,
      amount: 100,
    });
    expect(rateQuoteCurrency(d)).toBe('USD');
    expect(needsToAmount(d)).toBe(false);
    expect(nextTransferStep({ ...d, rate: 90 })).toBe('confirm');
  });
});
