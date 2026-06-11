import { createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import { notify } from '@/shared/ui/toast';
import type { RecurringItem } from '@/shared/api/types';

// BR-12 — регулярные позиции; фикс-цена включает позицию в индекс инфляции

export const loadRecurringFx = createEffect(() => api.get<RecurringItem[]>('/recurring'));

export const createRecurringFx = createEffect(
  (input: { name: string; categoryId: string; isFixedPrice: boolean }) =>
    api.post<RecurringItem>('/recurring', input),
);

export const updateRecurringFx = createEffect(
  ({ id, input }: { id: string; input: Partial<{ name: string; categoryId: string; isFixedPrice: boolean }> }) =>
    api.patch<RecurringItem>(`/recurring/${id}`, input),
);

export const deleteRecurringFx = createEffect((id: string) => api.del(`/recurring/${id}`));

export const recurringInvalidated = createEvent();

export const $recurring = createStore<RecurringItem[]>([]).on(
  loadRecurringFx.doneData,
  (_, rows) => rows,
);

sample({
  clock: [recurringInvalidated, createRecurringFx.done, updateRecurringFx.done, deleteRecurringFx.done],
  target: loadRecurringFx,
});

createRecurringFx.done.watch(() => notify('Добавлено'));
updateRecurringFx.done.watch(() => notify('Сохранено'));
deleteRecurringFx.done.watch(() => notify('Удалено'));
createRecurringFx.failData.watch((e) => notify(e.message, 'error'));
deleteRecurringFx.failData.watch((e) => notify(e.message, 'error'));
