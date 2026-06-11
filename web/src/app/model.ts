import { createEvent, sample } from 'effector';
import { loadCategoriesFx } from '@/entities/category/model';
import { loadTagsFx } from '@/entities/tag/model';

export const appStarted = createEvent();

sample({ clock: appStarted, target: [loadCategoriesFx, loadTagsFx] });
