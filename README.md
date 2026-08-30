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

## Telegram-бот

Бот позволяет заносить траты и смотреть статистику прямо из Telegram. Он запускается внутри
процесса API (модуль [`api/src/bot`](api/src/bot)) в режиме long polling — публичный адрес и проброс
портов не нужны. Работает, пока запущен API; данные пишет в ту же БД.

1. Создайте бота у [@BotFather](https://t.me/BotFather), получите токен.
2. Скопируйте `api/.env.example` в `api/.env` и впишите `BOT_TOKEN`.
3. Запустите API (`npm run start:dev`), напишите боту `/whoami` — он ответит вашим Telegram ID.
4. Впишите этот ID в `ALLOWED_TELEGRAM_IDS` (через запятую, если несколько) и перезапустите API.

Без `BOT_TOKEN` бот не стартует — API при этом работает как обычно. Доступ к боту ограничен
списком `ALLOWED_TELEGRAM_IDS`: чужие сообщения отклоняются.

Использование:

- Запись траты — текстом: `кофе 200` или `200 такси домой`. По метке бот предложит категорию
  (обучается на ваших прошлых вводах, BR-7); подтверждение — кнопкой. Если счетов несколько,
  бот спросит счёт списания; для валютного счёта — курс.
- `/today`, `/month` — траты за день/месяц по категориям.
- `/stats` — месяц вместе со статусом бюджетов.
- `/budget` — план/факт по бюджетам; при близости к лимиту или превышении бот предупреждает
  сразу после записи траты.

## Деплой и откат

Прод — один сервер в режиме «только бот»: наружу не публикуется ничего, бот сам ходит в
Telegram (long polling). Оверрайд — [`docker-compose.prod.yml`](docker-compose.prod.yml), там же
описан SSH-туннель, если нужно подключить локальный веб к прод-API.

Перед деплоем — дамп БД (автоматического бэкапа в деплое нет):

```bash
docker exec finflow-postgres pg_dump -U finflow --clean --if-exists finflow > finflow-$(date +%F).sql
```

Деплой:

```bash
ssh root@<server-ip>
cd finance
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f api          # убедиться, что миграции прошли и бот поднялся
```

Миграции из `api/drizzle` и сидинг дефолтных категорий выполняются при каждом старте
контейнера, оба идемпотентны (`CMD` в [`api/Dockerfile`](api/Dockerfile)). Важное следствие:
на непустой БД сидинг пропускает себя целиком, поэтому новые дефолтные категории на прод
через него не попадают — если категория нужна работающему коду, она должна создаваться
лениво (так сделана служебная «Перевод между счетами» в `TransactionsService`).

Откат:

```bash
git checkout <прошлый-sha>   # или git revert <merge-sha>, чтобы остаться на main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Откат кода безопасен, пока в релизе не было новой миграции. Проверить:

```bash
git diff --stat <sha-на-проде>..HEAD -- api/drizzle
```

Пусто — откатывается одной пересборкой: схема БД не менялась, а данные, появившиеся под новой
версией, старый код читает как обычные записи. Если миграция была, down-скриптов у drizzle нет:
аддитивные изменения (новая колонка или таблица) старый код обычно переживает, несовместимые —
только восстановлением из дампа:

```bash
docker exec -i finflow-postgres psql -U finflow -d finflow < finflow-2026-08-28.sql
```

Если после деплоя бот молчит — первым делом проверить запиненный IP `api.telegram.org`
в `docker-compose.prod.yml`: с РФ-серверов часть подсети Telegram заблокирована, и рабочий
адрес со временем меняется.

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
