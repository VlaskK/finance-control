import { createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import {
  createTransactionFx,
  deleteTransactionFx,
  updateTransactionFx,
} from '@/entities/transaction/model';
import type { TransactionRow } from '@/shared/api/types';

// Лента на экране ввода независима от фильтров истории (FR-A1 —
// операция появляется немедленно)
const loadRecentFx = createEffect(() => api.get<TransactionRow[]>('/transactions'));

export const entryOpened = createEvent();

export const $recent = createStore<TransactionRow[]>([]).on(
  loadRecentFx.doneData,
  (_, rows) => rows,
);

sample({
  clock: [entryOpened, createTransactionFx.done, updateTransactionFx.done, deleteTransactionFx.done],
  target: loadRecentFx,
});
