// Период отчёта в боте: пресет от сегодняшней даты, произвольный диапазон или
// «всё время» (границ нет). Чистый модуль — им пользуются и /stats, и разбивка
// по категориям; компактный токен нужен, чтобы период влезал в callback_data.

import { periodRange } from '../analytics/periods';

export type PresetKey = 'd' | 'y' | 'w' | 'm' | 'pm' | 'yr' | 'a';

export type StatPeriod =
  | { kind: 'preset'; preset: PresetKey }
  | { kind: 'range'; from: string; to: string };

export interface ResolvedPeriod {
  from: string | null; // null — без нижней границы
  to: string | null; // null — без верхней границы
  title: string;
}

const PRESET_TITLES: Record<PresetKey, string> = {
  d: 'сегодня',
  y: 'вчера',
  w: 'эта неделя',
  m: 'этот месяц',
  pm: 'прошлый месяц',
  yr: 'этот год',
  a: 'всё время',
};

const PRESET_KEYS = Object.keys(PRESET_TITLES) as PresetKey[];

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

// Любой день прошлого месяца — чтобы спросить у periodRange его границы.
function dayInPrevMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

export function resolvePreset(preset: PresetKey, todayIso = today()): ResolvedPeriod {
  const title = PRESET_TITLES[preset];
  switch (preset) {
    case 'd':
      return { from: todayIso, to: todayIso, title };
    case 'y': {
      const day = shiftDays(todayIso, -1);
      return { from: day, to: day, title };
    }
    case 'w':
      return { ...periodRange('week', todayIso), title };
    case 'm':
      return { ...periodRange('month', todayIso), title };
    case 'pm':
      return { ...periodRange('month', dayInPrevMonth(todayIso)), title };
    case 'yr':
      return { ...periodRange('year', todayIso), title };
    case 'a':
      return { from: null, to: null, title };
  }
}

export function resolvePeriod(period: StatPeriod, todayIso = today()): ResolvedPeriod {
  if (period.kind === 'range') {
    return { from: period.from, to: period.to, title: `${period.from} — ${period.to}` };
  }
  return resolvePreset(period.preset, todayIso);
}

// Один сегмент callback_data: 'm' или 'r2026060120260630' (без разделителей,
// чтобы вместе с UUID категории уложиться в 64 байта).
export function encodePeriod(period: StatPeriod): string {
  if (period.kind === 'range') {
    return `r${period.from.replaceAll('-', '')}${period.to.replaceAll('-', '')}`;
  }
  return period.preset;
}

const unpackDate = (packed: string) =>
  `${packed.slice(0, 4)}-${packed.slice(4, 6)}-${packed.slice(6, 8)}`;

// Неизвестный токен (кнопка из сообщения старой версии) — безопасный дефолт «месяц».
export function decodePeriod(token: string): StatPeriod {
  if (token?.startsWith('r') && token.length === 17) {
    return {
      kind: 'range',
      from: unpackDate(token.slice(1, 9)),
      to: unpackDate(token.slice(9)),
    };
  }
  const preset = PRESET_KEYS.includes(token as PresetKey) ? (token as PresetKey) : 'm';
  return { kind: 'preset', preset };
}
