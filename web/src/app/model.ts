import { createEvent, sample } from 'effector';
import { loadCategoriesFx } from '@/entities/category/model';
import { loadTagsFx } from '@/entities/tag/model';
import { loadAccountsFx } from '@/entities/account/model';
import {
  createTransactionFx,
  deleteTransactionFx,
  updateTransactionFx,
} from '@/entities/transaction/model';

export const appStarted = createEvent();

sample({ clock: appStarted, target: [loadCategoriesFx, loadTagsFx, loadAccountsFx] });

// Операции меняют балансы счетов — перечитываем их здесь, чтобы не связывать entity между собой
sample({
  clock: [createTransactionFx.done, updateTransactionFx.done, deleteTransactionFx.done],
  target: loadAccountsFx,
});
