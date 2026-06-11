import { createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import { notify } from '@/shared/ui/toast';
import type { TagRef } from '@/shared/api/types';

export const loadTagsFx = createEffect(() => api.get<TagRef[]>('/tags'));
export const createTagFx = createEffect((name: string) => api.post<TagRef>('/tags', { name }));
export const deleteTagFx = createEffect((id: string) => api.del(`/tags/${id}`));

export const tagsInvalidated = createEvent();

export const $tags = createStore<TagRef[]>([]).on(loadTagsFx.doneData, (_, tags) => tags);

sample({ clock: [tagsInvalidated, createTagFx.done, deleteTagFx.done], target: loadTagsFx });

createTagFx.done.watch(() => notify('Добавлено'));
deleteTagFx.done.watch(() => notify('Удалено'));
createTagFx.failData.watch((e) => notify(e.message, 'error'));
