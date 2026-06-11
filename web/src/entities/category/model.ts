import { createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import type { Category, CategoryNode, TxType } from '@/shared/api/types';

export const loadCategoriesFx = createEffect(() => api.get<CategoryNode[]>('/categories'));

// дёргается после любых мутаций категорий
export const categoriesInvalidated = createEvent();

export const $categoryTree = createStore<CategoryNode[]>([]).on(
  loadCategoriesFx.doneData,
  (_, tree) => tree,
);

// BR-3 — архивные скрыты на экране ввода, но остаются в истории и аналитике
export const $activeTree = $categoryTree.map((tree) =>
  tree
    .filter((c) => c.active)
    .map((c) => ({ ...c, children: c.children.filter((ch) => ch.active) })),
);

// плоский индекс id → категория (для отображения имён где угодно)
export const $categoryIndex = $categoryTree.map((tree) => {
  const index = new Map<string, Category>();
  for (const root of tree) {
    index.set(root.id, root);
    for (const child of root.children) index.set(child.id, child);
  }
  return index;
});

export function rootsOfType(tree: CategoryNode[], type: TxType): CategoryNode[] {
  return tree.filter((c) => c.type === type);
}

sample({ clock: categoriesInvalidated, target: loadCategoriesFx });
