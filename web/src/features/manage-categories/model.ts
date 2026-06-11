import { createEffect, sample } from 'effector';
import { api } from '@/shared/api/client';
import { notify } from '@/shared/ui/toast';
import { categoriesInvalidated } from '@/entities/category/model';
import { transactionsInvalidated } from '@/entities/transaction/model';
import type { Category, TxType } from '@/shared/api/types';

export interface CategoryInput {
  name: string;
  type: TxType;
  parentId?: string | null;
  description?: string | null;
  color?: string;
}

export const createCategoryFx = createEffect((input: CategoryInput) =>
  api.post<Category>('/categories', input),
);

export const updateCategoryFx = createEffect(
  ({ id, input }: { id: string; input: Partial<CategoryInput> & { active?: boolean } }) =>
    api.patch<Category>(`/categories/${id}`, input),
);

// FR-C4 / BR-5
export const mergeCategoryFx = createEffect(
  ({ id, targetId }: { id: string; targetId: string }) =>
    api.post(`/categories/${id}/merge`, { targetId }),
);

// BR-4 — сервер откажет, если категория используется
export const deleteCategoryFx = createEffect((id: string) => api.del(`/categories/${id}`));

sample({
  clock: [
    createCategoryFx.done,
    updateCategoryFx.done,
    mergeCategoryFx.done,
    deleteCategoryFx.done,
  ],
  target: categoriesInvalidated,
});

// слияние переписывает категорию у операций — история должна перечитаться
sample({ clock: mergeCategoryFx.done, target: transactionsInvalidated });

createCategoryFx.done.watch(() => notify('Добавлено'));
updateCategoryFx.done.watch(() => notify('Сохранено'));
mergeCategoryFx.done.watch(() => notify('Категории слиты'));
deleteCategoryFx.done.watch(() => notify('Удалено'));

createCategoryFx.failData.watch((e) => notify(e.message, 'error'));
updateCategoryFx.failData.watch((e) => notify(e.message, 'error'));
mergeCategoryFx.failData.watch((e) => notify(e.message, 'error'));
deleteCategoryFx.failData.watch((e) => notify(e.message, 'error'));
