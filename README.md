# FinFlow — личный финансовый трекер

Реализация по спецификации [Требования_FinanceTracker.md](Требования_FinanceTracker.md):
ручной ввод трат, история с правкой, двухуровневые категории с архивом и слиянием,
графики за день/неделю/месяц/год, бюджеты план/факт, динамика трат, средний чек,
разложение «частота × чек» и индекс личной инфляции (Ласпейрес), импорт CSV и экспорт-бэкап.

## Стек (§8)

- **Фронт:** React 19 · TypeScript · Effector · Vite · Recharts · Feature-Sliced Design — [`web/`](web/)
- **Бэк:** NestJS · Drizzle ORM · PostgreSQL · Zod — [`api/`](api/)
- **Инфраструктура:** Docker Compose (`postgres` + `api`), всё на localhost (NFR-S1)

## Быстрый старт

Нужны Node.js 22+ и Docker Desktop (для PostgreSQL).

```bash
# 1. БД + API (миграции и сидинг категорий выполняются при старте контейнера)
docker compose up --build -d

# 2. Фронтенд
cd web
npm install
npm run dev          # http://localhost:5173
```

### Без Docker для API (разработка)

```bash
docker compose up postgres -d   # только БД
cd api
npm install
npm run db:migrate              # применить миграции из api/drizzle
npm run db:seed                 # дефолтные категории (Приложение A)
npm run start:dev               # http://localhost:3000
```

Если Docker нет совсем — подойдёт любой локальный PostgreSQL 16: создайте БД и передайте
`DATABASE_URL=postgres://user:pass@localhost:5432/finflow` (по умолчанию
`postgres://finflow:finflow@localhost:5432/finflow`). Адрес API для фронта переопределяется
переменной `VITE_API_URL` (по умолчанию `http://localhost:3000`).

## Тесты (NFR-T1)

```bash
cd api && npm test    # Jest: CALC-3…6, периоды, CSV — 46 тестов
cd web && npm test    # Vitest: группировка истории, парсинг сумм
cd api && npm run typecheck && cd ../web && npm run typecheck
```

## Импорт CSV (FR-G2)

Заголовки распознаются по-русски и по-английски, разделитель `;` или `,`:

```csv
date;amount;category;subcategory;label;note;type
2026-02-01;45000;Жильё;Аренда;;;расход
01.03.2026;1 250,50;Продукты;;Перекрёсток;;
```

Обязательны `дата`, `сумма`, `категория`; незнакомые категории создаются автоматически;
`тип` — расход/перевод/доход (по умолчанию — выбранный в форме импорта). Валидные строки
импортируются, проблемные возвращаются списком с причинами.

## Структура

```
api/src/
  transactions/   CRUD операций, метки и автоподсказки (BR-7)
  categories/     дерево, архив (BR-3), слияние (BR-5), удаление пустых (BR-4)
  budgets/        лимиты (FR-F)
  tags/           теги и отчёт по тегу (BR-9)
  recurring/      регулярные позиции (BR-12)
  analytics/      CALC-1…6: by-category, series, dynamics, inflation, budget-status
  data/           импорт CSV, экспорт JSON/CSV, восстановление бэкапа (FR-G)
  insights/       заглушка LLM-инсайтов (фаза 2)
  database/       drizzle-схема, миграции, сидинг
web/src/
  app/ pages/ widgets/ features/ entities/ shared/   — FSD (§8.5)
```

## Статус по дорожной карте (§9)

| Веха | Состояние |
|---|---|
| 1 — Каркас (ввод, история, категории, импорт CSV) | ✅ |
| 2 — Контроль расходов (категории, графики, бюджеты, экспорт) | ✅ |
| 3 — Динамика и инфляция (CALC-3…6, метки, регулярные позиции, слияние) | ✅ |
| 4 — Полировка (теги, фильтры/поиск, план/факт) | ✅, кроме разделения категорий (FR-C5 `[C]`) |
| Фаза 2 — LLM-инсайты, VPS + auth, синхронизация | не начиналась (по плану) |

Отступление от контракта §8.7: вместо `GET /export?format=csv` сделаны два маршрута —
`GET /export` (JSON) и `GET /export/csv`; добавлены не описанные в таблице, но нужные фичам
`GET /analytics/series` (FR-D3), `GET /analytics/budget-status` (FR-D4), `GET /transactions/labels`
(FR-A4) и CRUD `/recurring` (BR-12). Интеграционные тесты правил BR-1…BR-6 на живой БД — в планах
(юнит-тестами покрыты расчёты и CSV).
