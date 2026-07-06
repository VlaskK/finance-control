// Бутстрап Telegram-бота (grammY, long polling внутри процесса API) и роутинг апдейтов.
// Логика диалогов живёт в handlers/*; здесь — allowlist, команды, диспетчеризация
// callback'ов (глобальные x/noop — тут, остальные — по session.mode) и статистика.

import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Bot, type Context } from 'grammy';
import { SessionStore } from './session';
import { CB, parseCb } from './callbacks';
import { EntryHandler } from './handlers/entry.handler';
import { TransferHandler } from './handlers/transfer.handler';
import { InfoHandler } from './handlers/info.handler';
import { StatsHandler } from './handlers/stats.handler';
import { HistoryHandler } from './handlers/history.handler';
import { EditHandler } from './handlers/edit.handler';
import { BudgetHandler } from './handlers/budget.handler';

const HELP = [
  '💸 <b>FinFlow-бот</b>',
  '',
  'Трата: <code>кофе 200</code> или <code>200 такси домой</code>',
  'Доход: <code>+50000 зарплата</code> (плюс перед суммой)',
  'Перевод между счетами: /transfer',
  'Бот предложит категорию и счёт; для валютного счёта спросит курс.',
  '',
  'Команды:',
  '/today — траты за сегодня',
  '/month — траты за текущий месяц',
  '/stats — аналитика за любой период',
  '/history — операции: просмотр и правка',
  '/budget — бюджеты (статус и лимиты)',
  '/accounts — балансы счетов',
  '/transfer — перевод между счетами',
  '/tags — отчёты по тегам',
  '/cancel — сбросить текущий диалог',
  '/whoami — ваш Telegram ID',
].join('\n');

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot?: Bot;
  private allowed = new Set<number>();

  constructor(
    private readonly sessions: SessionStore,
    private readonly entry: EntryHandler,
    private readonly transfer: TransferHandler,
    private readonly info: InfoHandler,
    private readonly stats: StatsHandler,
    private readonly history: HistoryHandler,
    private readonly edit: EditHandler,
    private readonly budget: BudgetHandler,
  ) {}

  async onModuleInit() {
    const token = process.env.BOT_TOKEN;
    if (!token) {
      this.logger.warn('BOT_TOKEN не задан — Telegram-бот не запущен (API работает без него).');
      return;
    }

    this.allowed = new Set(
      (process.env.ALLOWED_TELEGRAM_IDS ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    if (this.allowed.size === 0) {
      this.logger.warn(
        'ALLOWED_TELEGRAM_IDS пуст — напишите боту, он подскажет ваш ID, затем добавьте его в .env.',
      );
    }

    const bot = new Bot(token);
    this.bot = bot;

    bot.use(async (ctx, next) => {
      const id = ctx.from?.id;
      if (id && this.allowed.has(id)) return next();
      await ctx.reply(
        `🚫 Доступ запрещён. Ваш Telegram ID: <code>${id ?? '?'}</code>\n` +
          'Добавьте его в ALLOWED_TELEGRAM_IDS и перезапустите бота.',
        { parse_mode: 'HTML' },
      );
    });

    bot.command(['start', 'help'], (ctx) => ctx.reply(HELP, { parse_mode: 'HTML' }));
    bot.command('whoami', (ctx) =>
      ctx.reply(`Ваш Telegram ID: <code>${ctx.from?.id}</code>`, { parse_mode: 'HTML' }),
    );
    bot.command('today', (ctx) => this.stats.command(ctx, 'd'));
    bot.command('month', (ctx) => this.stats.command(ctx, 'm'));
    bot.command('stats', (ctx) => this.stats.command(ctx, 'm'));
    bot.command('history', (ctx) => this.history.command(ctx));
    bot.command('budget', (ctx) => this.budget.command(ctx));
    bot.command('tags', (ctx) => this.info.tagsList(ctx));
    bot.command('accounts', (ctx) => this.info.accountsList(ctx));
    bot.command('transfer', (ctx) => this.transfer.start(ctx));
    bot.command('income', (ctx) =>
      ctx.reply('Доход — плюс перед суммой: <code>+50000 зарплата</code>', {
        parse_mode: 'HTML',
      }),
    );
    bot.command('cancel', (ctx) => this.info.cancel(ctx));

    bot.on('callback_query:data', (ctx) => this.routeCallback(ctx));
    bot.on('message:text', (ctx) => this.routeText(ctx));

    bot.catch((err) => this.logger.error(`Ошибка бота: ${err.message}`, err.error as Error));

    try {
      await bot.api.setMyCommands([
        { command: 'today', description: 'Траты за сегодня' },
        { command: 'month', description: 'Траты за месяц' },
        { command: 'stats', description: 'Аналитика за любой период' },
        { command: 'history', description: 'Операции: просмотр и правка' },
        { command: 'budget', description: 'Бюджеты: статус и лимиты' },
        { command: 'accounts', description: 'Балансы счетов' },
        { command: 'transfer', description: 'Перевод между счетами' },
        { command: 'tags', description: 'Отчёты по тегам' },
        { command: 'income', description: 'Как записать доход' },
        { command: 'cancel', description: 'Сбросить текущий диалог' },
        { command: 'help', description: 'Справка' },
        { command: 'whoami', description: 'Мой Telegram ID' },
      ]);

      // Long polling крутится в фоне; не ждём завершения промиса.
      void bot.start({
        onStart: (info) =>
          this.logger.log(`Telegram-бот @${info.username} запущен (long polling).`),
      });
    } catch (err) {
      // Неверный токен или сбой сети не должны ронять API.
      this.bot = undefined;
      this.logger.error(`Не удалось запустить Telegram-бота: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.bot) await this.bot.stop();
  }

  // ——— Роутинг ———

  private async routeCallback(ctx: Context) {
    const data = ctx.callbackQuery?.data ?? '';
    const userId = ctx.from!.id;

    if (data === CB.cancel) {
      this.sessions.clear(userId);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('Отменено.');
      return;
    }
    if (data === CB.noop) {
      await ctx.answerCallbackQuery();
      return;
    }

    // Stateless-представления — работают и без сессии, старые сообщения
    // с такими кнопками живут вечно (статистика, динамика, теги, карточка операции).
    const { ns, args } = parseCb(data);
    if (ns === CB.period && args[0] === 's') {
      return this.stats.handleCallback(ctx, args.slice(1));
    }
    if (ns === CB.dynamics) {
      return this.stats.handleDynamics(ctx, args[0]);
    }
    if (ns === CB.tag) {
      return this.info.tagReport(ctx, args[0]);
    }
    if (ns === CB.edit) {
      // txId в callback — карточка восстанавливает сессию сама
      return this.edit.handleEditCallback(ctx, data);
    }
    if (ns === CB.history) {
      return this.history.handleCallback(ctx, data);
    }
    if (ns === CB.budget) {
      return this.budget.handleCallback(ctx);
    }

    const session = this.sessions.get(userId);
    if (!session) {
      await ctx.answerCallbackQuery({ text: 'Сессия истекла, начните заново.' });
      return;
    }

    switch (session.mode) {
      case 'expense':
      case 'income':
        return this.entry.handleCallback(ctx, data, session);
      case 'transfer':
        return this.transfer.handleCallback(ctx, data, session);
      case 'history':
        // c:/a: — выбор значения фильтра
        return this.history.handlePickCallback(ctx, data, session);
      case 'edit':
        if (ns === CB.editDate) {
          return this.edit.handleDateShortcut(ctx, args[0], session);
        }
        // c:/s:/a: — смена категории или счёта операции
        return this.edit.handlePickCallback(ctx, data, session);
      case 'budget_set':
        return this.budget.handlePickCallback(ctx, data, session);
      case 'await_range':
        // Кнопок в этом режиме нет — ждём текст с датами.
        return ctx.answerCallbackQuery();
    }
  }

  private async routeText(ctx: Context) {
    const session = this.sessions.get(ctx.from!.id);
    // Диалоги, ожидающие текстовый ввод, — раньше парсинга трат.
    if (session?.mode === 'transfer') {
      return this.transfer.handleText(ctx, session);
    }
    if (session?.mode === 'await_range') {
      return this.stats.handleRangeText(ctx, session);
    }
    if (session?.mode === 'history' && session.awaiting) {
      return this.history.handleText(ctx, session);
    }
    if (session?.mode === 'edit' && session.field) {
      return this.edit.handleText(ctx, session);
    }
    if (session?.mode === 'budget_set' && session.categoryId) {
      return this.budget.handleText(ctx, session);
    }
    return this.entry.handleText(ctx);
  }
}
