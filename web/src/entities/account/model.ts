import { createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import { notify } from '@/shared/ui/toast';
import type {
  Account,
  AccountRate,
  CreateAccountInput,
  SetRateInput,
  UpdateAccountInput,
} from '@/shared/api/types';

export const loadAccountsFx = createEffect(() => api.get<Account[]>('/accounts'));

export const createAccountFx = createEffect((input: CreateAccountInput) =>
  api.post<Account>('/accounts', input),
);

export const updateAccountFx = createEffect(
  ({ id, ...input }: UpdateAccountInput & { id: string }) =>
    api.patch<Account>(`/accounts/${id}`, input),
);

export const deleteAccountFx = createEffect((id: string) => api.del(`/accounts/${id}`));

// Ставки (история по счёту)
export const loadRatesFx = createEffect((accountId: string) =>
  api.get<AccountRate[]>(`/accounts/${accountId}/rates`),
);

export const addRateFx = createEffect(({ id, ...input }: SetRateInput & { id: string }) =>
  api.post<AccountRate>(`/accounts/${id}/rates`, input),
);

export const deleteRateFx = createEffect(
  ({ id, rateId }: { id: string; rateId: string }) =>
    api.del(`/accounts/${id}/rates/${rateId}`),
);

export const accountsInvalidated = createEvent();

export const $accounts = createStore<Account[]>([]).on(
  loadAccountsFx.doneData,
  (_, rows) => rows,
);

export const $activeAccounts = $accounts.map((rows) => rows.filter((a) => a.active));

export const $defaultAccount = $accounts.map(
  (rows) => rows.find((a) => a.isDefault) ?? null,
);

sample({
  clock: [
    accountsInvalidated,
    createAccountFx.done,
    updateAccountFx.done,
    deleteAccountFx.done,
    addRateFx.done,
    deleteRateFx.done,
  ],
  target: loadAccountsFx,
});

createAccountFx.done.watch(() => notify('Счёт создан'));
createAccountFx.failData.watch((e) => notify(e.message, 'error'));
updateAccountFx.done.watch(() => notify('Сохранено'));
updateAccountFx.failData.watch((e) => notify(e.message, 'error'));
deleteAccountFx.done.watch(() => notify('Счёт удалён'));
deleteAccountFx.failData.watch((e) => notify(e.message, 'error'));
addRateFx.done.watch(() => notify('Ставка добавлена'));
addRateFx.failData.watch((e) => notify(e.message, 'error'));
deleteRateFx.done.watch(() => notify('Ставка удалена'));
deleteRateFx.failData.watch((e) => notify(e.message, 'error'));
