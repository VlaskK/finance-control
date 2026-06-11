import { combine, createEffect, createEvent, createStore, sample } from 'effector';
import { api } from '@/shared/api/client';
import { shiftPeriod, todayIso } from '@/shared/lib/dates';
import type {
  BudgetStatusResponse,
  ByCategoryResponse,
  Period,
  SeriesResponse,
} from '@/shared/api/types';

export interface ChartsParams {
  period: Period;
  date: string;
  includeTransfers: boolean;
  includeIncome: boolean;
}

export const chartsOpened = createEvent();
export const periodChanged = createEvent<Period>(); // FR-D1
export const dateShifted = createEvent<number>(); // FR-D1 — пред./след. период
export const dateReset = createEvent();
export const transfersToggled = createEvent(); // FR-D5
export const incomeToggled = createEvent(); // FR-D5

export const $period = createStore<Period>('month').on(periodChanged, (_, p) => p);

export const $date = createStore(todayIso()).reset(dateReset);

sample({
  clock: dateShifted,
  source: { period: $period, date: $date },
  fn: ({ period, date }, delta) => shiftPeriod(period, date, delta),
  target: $date,
});

export const $includeTransfers = createStore(false).on(transfersToggled, (v) => !v);
export const $includeIncome = createStore(false).on(incomeToggled, (v) => !v);

const $params = combine({
  period: $period,
  date: $date,
  includeTransfers: $includeTransfers,
  includeIncome: $includeIncome,
});

export const loadByCategoryFx = createEffect((p: ChartsParams) =>
  api.get<ByCategoryResponse>('/analytics/by-category', { ...p }),
);

export const loadSeriesFx = createEffect((p: ChartsParams) =>
  api.get<SeriesResponse>('/analytics/series', { ...p }),
);

export const loadBudgetStatusFx = createEffect((month: string) =>
  api.get<BudgetStatusResponse>('/analytics/budget-status', { month }),
);

export const $byCategory = createStore<ByCategoryResponse | null>(null).on(
  loadByCategoryFx.doneData,
  (_, data) => data,
);

export const $series = createStore<SeriesResponse | null>(null).on(
  loadSeriesFx.doneData,
  (_, data) => data,
);

export const $budgetStatus = createStore<BudgetStatusResponse | null>(null).on(
  loadBudgetStatusFx.doneData,
  (_, data) => data,
);

sample({
  clock: [chartsOpened, $params],
  source: $params,
  target: [loadByCategoryFx, loadSeriesFx],
});

// FR-D4 — план/факт показывается для месячного периода
sample({
  clock: [chartsOpened, $params],
  source: $params,
  filter: ({ period }) => period === 'month',
  fn: ({ date }) => date.slice(0, 7),
  target: loadBudgetStatusFx,
});
