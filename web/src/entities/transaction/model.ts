import { createEffect, createEvent, createStore, sample } from 'effector';
import { api, ApiError } from '@/shared/api/client';
import { notify } from '@/shared/ui/toast';
import type {
  CreateTransactionInput,
  TransactionFilters,
  TransactionRow,
  UpdateTransactionInput,
} from '@/shared/api/types';

export const loadTransactionsFx = createEffect((filters: TransactionFilters) =>
  api.get<TransactionRow[]>('/transactions', { ...filters }),
);

export const createTransactionFx = createEffect((input: CreateTransactionInput) =>
  api.post<TransactionRow>('/transactions', input),
);

export const updateTransactionFx = createEffect(
  ({ id, input }: { id: string; input: UpdateTransactionInput }) =>
    api.patch<TransactionRow>(`/transactions/${id}`, input),
);

export const deleteTransactionFx = createEffect((id: string) =>
  api.del<{ deleted: boolean }>(`/transactions/${id}`),
);

// FR-B4 — фильтры истории; частичный патч, undefined снимает фильтр
export const filtersChanged = createEvent<TransactionFilters>();
export const filtersReset = createEvent();

export const $filters = createStore<TransactionFilters>({})
  .on(filtersChanged, (current, patch) => ({ ...current, ...patch }))
  .reset(filtersReset);

export const $transactions = createStore<TransactionRow[]>([]).on(
  loadTransactionsFx.doneData,
  (_, rows) => rows,
);

export const transactionsInvalidated = createEvent();

sample({ clock: $filters, target: loadTransactionsFx });
sample({
  clock: [
    transactionsInvalidated,
    createTransactionFx.done,
    updateTransactionFx.done,
    deleteTransactionFx.done,
  ],
  source: $filters,
  target: loadTransactionsFx,
});

// NFR-U2 — кнопка и тост говорят одним словом
createTransactionFx.done.watch(() => notify('Добавлено'));
updateTransactionFx.done.watch(() => notify('Сохранено'));
deleteTransactionFx.done.watch(() => notify('Удалено'));
deleteTransactionFx.failData.watch((e) => notify(e.message, 'error'));
loadTransactionsFx.failData.watch((e) => {
  if (e instanceof ApiError && e.status === 0) notify(e.message, 'error');
});
