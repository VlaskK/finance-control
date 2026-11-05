// FR-D6 — суммы по категориям и подкатегориям за период или за всё время.
// Данные тянутся один раз на период целиком: выделение категорий и подсчёт
// суммы выделенного — на клиенте, без лишних запросов.

import { combine, createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import { currentMonthIso, todayIso } from '@/shared/lib/dates';
import { rangeOf, type RangePreset, type SummaryRange } from './lib';
import type { CategoryTotalsResponse } from '@/shared/api/types';

export const summaryOpened = createEvent();
export const presetChanged = createEvent<RangePreset>();
export const customFromChanged = createEvent<string>();
export const customToChanged = createEvent<string>();
export const selectionToggled = createEvent<string>();
export const selectionCleared = createEvent();

export const $preset = createStore<RangePreset>('month').on(presetChanged, (_, p) => p);

export const $customFrom = createStore(`${currentMonthIso()}-01`).on(
  customFromChanged,
  (_, v) => v,
);
export const $customTo = createStore(todayIso()).on(customToChanged, (_, v) => v);

export const $range = combine(
  { preset: $preset, from: $customFrom, to: $customTo },
  ({ preset, from, to }) => rangeOf(preset, { from, to }),
);

export const loadCategoryTotalsFx = createEffect((range: SummaryRange) =>
  api.get<CategoryTotalsResponse>('/analytics/category-totals', { ...range }),
);

export const $totals = createStore<CategoryTotalsResponse | null>(null).on(
  loadCategoryTotalsFx.doneData,
  (_, data) => data,
);

// Ошибку загрузки показываем текстом: пустой список и «операций нет» выглядят
// одинаково, а это разные вещи (например, API ещё без нового маршрута).
export const $loadError = createStore<string | null>(null)
  .on(loadCategoryTotalsFx.failData, (_, error) => error.message)
  .reset(loadCategoryTotalsFx.done);

export const $selected = createStore<string[]>([])
  .on(selectionToggled, (ids, id) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
  )
  .reset(selectionCleared);

sample({
  clock: [summaryOpened, $range],
  source: $range,
  target: loadCategoryTotalsFx,
});
