import { createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import { notify } from '@/shared/ui/toast';
import type { BudgetRow } from '@/shared/api/types';

export const loadBudgetsFx = createEffect(() => api.get<BudgetRow[]>('/budgets'));

// FR-F1 — null снимает лимит
export const upsertBudgetFx = createEffect(
  (input: { categoryId: string; monthlyLimit: number | null }) => api.put('/budgets', input),
);

export const budgetsInvalidated = createEvent();

export const $budgets = createStore<BudgetRow[]>([]).on(loadBudgetsFx.doneData, (_, rows) => rows);

sample({ clock: [budgetsInvalidated, upsertBudgetFx.done], target: loadBudgetsFx });

upsertBudgetFx.done.watch(() => notify('Сохранено'));
upsertBudgetFx.failData.watch((e) => notify(e.message, 'error'));
