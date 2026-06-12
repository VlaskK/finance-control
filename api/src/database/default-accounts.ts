// Дефолтные счета. Основной источник — миграция 0001 (она же делает backfill);
// этот список нужен сиду как страховка для БД, созданных вне миграций.
export const DEFAULT_ACCOUNTS = [
  { name: 'Общий', currency: 'RUB', isDefault: true, sortOrder: 0 },
  { name: 'Инвестиционный', currency: 'RUB', isDefault: false, sortOrder: 1 },
  { name: 'Валютный', currency: 'USD', isDefault: false, sortOrder: 2 },
] as const;
