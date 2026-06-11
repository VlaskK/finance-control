import { combine, createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import { loadRecurringFx } from '@/entities/recurring/model';
import { currentMonthIso, shiftMonths } from '@/shared/lib/dates';
import type { DynamicsResponse, InflationResponse } from '@/shared/api/types';

export const dynamicsOpened = createEvent();
export const fromChanged = createEvent<string>();
export const toChanged = createEvent<string>();
export const granularityChanged = createEvent<'month' | 'year'>();

// по умолчанию — последние 6 месяцев (FR-E1: произвольный диапазон месяцев/лет)
export const $from = createStore(shiftMonths(currentMonthIso(), -5)).on(
  fromChanged,
  (_, v) => v,
);
export const $to = createStore(currentMonthIso()).on(toChanged, (_, v) => v);
export const $granularity = createStore<'month' | 'year'>('month').on(
  granularityChanged,
  (_, v) => v,
);

const $params = combine({ from: $from, to: $to, granularity: $granularity });

export const loadDynamicsFx = createEffect(
  (p: { from: string; to: string; granularity: 'month' | 'year' }) =>
    api.get<DynamicsResponse>('/analytics/dynamics', { ...p }),
);

export const loadInflationFx = createEffect((p: { from: string; to: string }) =>
  api.get<InflationResponse>('/analytics/inflation', { from: p.from, to: p.to }),
);

export const $dynamics = createStore<DynamicsResponse | null>(null).on(
  loadDynamicsFx.doneData,
  (_, data) => data,
);

export const $inflation = createStore<InflationResponse | null>(null).on(
  loadInflationFx.doneData,
  (_, data) => data,
);

const validRange = ({ from, to }: { from: string; to: string }) => Boolean(from && to && from <= to);

sample({
  clock: [dynamicsOpened, $params],
  source: $params,
  filter: validRange,
  target: [loadDynamicsFx, loadInflationFx],
});

sample({ clock: dynamicsOpened, target: loadRecurringFx });
