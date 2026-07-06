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
import { AnalyticsService } from '../analytics/analytics.service';
import { formatBreakdown, formatBudget } from './format';
import { SessionStore } from './session';
import { CB } from './callbacks';
import { EntryHandler } from './handlers/entry.handler';
import { TransferHandler } from './handlers/transfer.handler';
import { InfoHandler } from './handlers/info.handler';

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
  '/stats — месяц + бюджеты',
  '/budget — статус бюджетов',
  '/accounts — балансы счетов',
  '/transfer — перевод между счетами',
  '/cancel — сбросить текущий диалог',
  '/whoami — ваш Telegram ID',
].join('\n');

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot?: Bot;
  private allowed = new Set<number>();

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly sessions: SessionStore,
    private readonly entry: EntryHandler,
    private readonly transfer: TransferHandler,
    private readonly info: InfoHandler,
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
    bot.command('today', (ctx) => this.handleStats(ctx, 'day', 'Траты за сегодня'));
    bot.command('month', (ctx) => this.handleStats(ctx, 'month', 'Траты за месяц'));
    bot.command('stats', (ctx) => this.handleStatsAndBudget(ctx));
    bot.command('budget', (ctx) => this.handleBudget(ctx));
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
        { command: 'stats', description: 'Месяц + бюджеты' },
        { command: 'budget', description: 'Статус бюджетов' },
        { command: 'accounts', description: 'Балансы счетов' },
        { command: 'transfer', description: 'Перевод между счетами' },
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

    const session = this.sessions.get(userId);
    if (!session) {
      await ctx.answerCallbackQuery({ text: 'Сессия истекла, отправьте трату заново.' });
      return;
    }

    switch (session.mode) {
      case 'expense':
      case 'income':
        return this.entry.handleCallback(ctx, data, session);
      case 'transfer':
        return this.transfer.handleCallback(ctx, data, session);
    }
  }

  private async routeText(ctx: Context) {
    const session = this.sessions.get(ctx.from!.id);
    // Wizard перевода ждёт число (сумма/курс/зачисление) — не парсим его как трату.
    if (session?.mode === 'transfer') {
      return this.transfer.handleText(ctx, session);
    }
    return this.entry.handleText(ctx);
  }

  // ——— Статистика (уезжает в stats.handler в следующей итерации) ———

  private async handleStats(ctx: Context, period: 'day' | 'month', title: string) {
    const data = await this.analytics.byCategory({
      period,
      date: this.today(),
      includeTransfers: false,
      includeIncome: false,
    });
    await ctx.reply(formatBreakdown(title, data), { parse_mode: 'HTML' });
  }

  private async handleStatsAndBudget(ctx: Context) {
    const breakdown = await this.analytics.byCategory({
      period: 'month',
      date: this.today(),
      includeTransfers: false,
      includeIncome: false,
    });
    const budget = await this.analytics.budgetStatus({ month: this.month() });
    await ctx.reply(
      `${formatBreakdown('Траты за месяц', breakdown)}\n\n${formatBudget(budget)}`,
      { parse_mode: 'HTML' },
    );
  }

  private async handleBudget(ctx: Context) {
    const budget = await this.analytics.budgetStatus({ month: this.month() });
    await ctx.reply(formatBudget(budget), { parse_mode: 'HTML' });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private month(): string {
    return new Date().toISOString().slice(0, 7);
  }
}
