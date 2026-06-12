import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Bot, InlineKeyboard, type Context } from 'grammy';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService, type CategoryNode } from '../categories/categories.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AccountsService } from '../accounts/accounts.service';
import { parseExpenseInput } from './parse';
import {
  escapeHtml,
  formatAmount,
  formatBreakdown,
  formatBudget,
  formatConfirmation,
} from './format';

interface PendingExpense {
  amount: number;
  label: string | null;
  note: string | null;
  rootId?: string;
  // выбранная пара категория/подкатегория (после шага категории)
  subId?: string | null;
  suggestion?: { categoryId: string; subcategoryId: string | null };
  // выбранный счёт и ожидание ввода курса для валютного счёта
  accountId?: string;
  awaitingRate?: boolean;
}

const HELP = [
  '💸 <b>FinFlow-бот</b>',
  '',
  'Чтобы записать трату — пришлите сумму и описание, например:',
  '<code>кофе 200</code> или <code>200 такси домой</code>',
  'Бот предложит категорию и счёт; для валютного счёта спросит курс.',
  '',
  'Команды:',
  '/today — траты за сегодня',
  '/month — траты за текущий месяц',
  '/stats — месяц + бюджеты',
  '/budget — статус бюджетов',
  '/whoami — ваш Telegram ID',
].join('\n');

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot?: Bot;
  private readonly pending = new Map<number, PendingExpense>();
  private allowed = new Set<number>();

  constructor(
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
    private readonly analytics: AnalyticsService,
    private readonly accounts: AccountsService,
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

    bot.on('callback_query:data', (ctx) => this.handleCallback(ctx));
    bot.on('message:text', (ctx) => this.handleText(ctx));

    bot.catch((err) => this.logger.error(`Ошибка бота: ${err.message}`, err.error as Error));

    try {
      await bot.api.setMyCommands([
        { command: 'today', description: 'Траты за сегодня' },
        { command: 'month', description: 'Траты за месяц' },
        { command: 'stats', description: 'Месяц + бюджеты' },
        { command: 'budget', description: 'Статус бюджетов' },
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

  // ——— Ввод траты ———

  private async handleText(ctx: Context) {
    const text = ctx.message?.text ?? '';

    // Ожидаем курс для валютного счёта — это число, а не новая трата
    const awaiting = this.pending.get(ctx.from!.id);
    if (awaiting?.awaitingRate) {
      const rate = Number(text.trim().replace(',', '.'));
      if (!Number.isFinite(rate) || rate <= 0) {
        await ctx.reply('Введите курс числом, например: <code>90.5</code>', {
          parse_mode: 'HTML',
        });
        return;
      }
      await this.createAndConfirm(ctx, ctx.from!.id, awaiting, rate);
      return;
    }

    const parsed = parseExpenseInput(text);
    if (!parsed) {
      await ctx.reply(
        'Не понял сумму. Пришлите, например: <code>кофе 200</code>\nИли /help для справки.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const userId = ctx.from!.id;
    const pending: PendingExpense = { ...parsed };

    // BR-7 — пробуем предложить категорию по выученной метке.
    if (parsed.label) {
      const suggestions = await this.transactions.suggestLabels(parsed.label);
      const top = suggestions[0];
      if (top) {
        const category = await this.categories.findOne(top.categoryId);
        pending.suggestion = { categoryId: top.categoryId, subcategoryId: top.subcategoryId };
        this.pending.set(userId, pending);
        const kb = new InlineKeyboard()
          .text(`✅ ${category.name} · ${formatAmount(parsed.amount)}`, 'g')
          .row()
          .text('Выбрать другую категорию', 'pick')
          .row()
          .text('Отмена', 'x');
        await ctx.reply(
          `Записать <b>${formatAmount(parsed.amount)}</b>` +
            (parsed.label ? ` «${escapeHtml(parsed.label)}»` : '') +
            ` в категорию <b>${escapeHtml(category.name)}</b>?`,
          { parse_mode: 'HTML', reply_markup: kb },
        );
        return;
      }
    }

    this.pending.set(userId, pending);
    await this.askRootCategory(ctx, parsed.amount, parsed.label);
  }

  private async askRootCategory(ctx: Context, amount: number, label: string | null) {
    const roots = await this.expenseRoots();
    if (!roots.length) {
      await ctx.reply('Нет категорий расходов. Создайте их в приложении.');
      return;
    }
    const kb = new InlineKeyboard();
    roots.forEach((r, i) => {
      kb.text(r.name, `c:${r.id}`);
      if (i % 2 === 1) kb.row();
    });
    kb.row().text('Отмена', 'x');
    await ctx.reply(
      `Выберите категорию для <b>${formatAmount(amount)}</b>` +
        (label ? ` «${escapeHtml(label)}»` : ''),
      { parse_mode: 'HTML', reply_markup: kb },
    );
  }

  private async handleCallback(ctx: Context) {
    const data = ctx.callbackQuery?.data ?? '';
    const userId = ctx.from!.id;
    const pending = this.pending.get(userId);

    if (data === 'x') {
      this.pending.delete(userId);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('Отменено.');
      return;
    }

    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'Сессия истекла, отправьте трату заново.' });
      return;
    }

    // Подтверждение предложенной категории.
    if (data === 'g' && pending.suggestion) {
      await ctx.answerCallbackQuery();
      await this.afterCategoryChosen(
        ctx,
        userId,
        pending,
        pending.suggestion.categoryId,
        pending.suggestion.subcategoryId,
      );
      return;
    }

    // Пользователь отказался от предложения — показать полный список.
    if (data === 'pick') {
      await ctx.answerCallbackQuery();
      await this.askRootCategory(ctx, pending.amount, pending.label);
      return;
    }

    // Выбор корневой категории.
    if (data.startsWith('c:')) {
      const rootId = data.slice(2);
      const roots = await this.expenseRoots();
      const root = roots.find((r) => r.id === rootId);
      const children = (root?.children ?? []).filter((c) => c.active);
      await ctx.answerCallbackQuery();

      if (!children.length) {
        await this.afterCategoryChosen(ctx, userId, pending, rootId, null);
        return;
      }
      pending.rootId = rootId;
      this.pending.set(userId, pending);
      const kb = new InlineKeyboard();
      children.forEach((c, i) => {
        kb.text(c.name, `s:${c.id}`);
        if (i % 2 === 1) kb.row();
      });
      kb.row().text('Без подкатегории', 's:-').row().text('Отмена', 'x');
      await ctx.editMessageText('Выберите подкатегорию:', { reply_markup: kb });
      return;
    }

    // Выбор подкатегории.
    if (data.startsWith('s:')) {
      const sub = data.slice(2);
      await ctx.answerCallbackQuery();
      await this.afterCategoryChosen(
        ctx,
        userId,
        pending,
        pending.rootId!,
        sub === '-' ? null : sub,
      );
      return;
    }

    // Выбор счёта.
    if (data.startsWith('a:')) {
      const accountId = data.slice(2);
      await ctx.answerCallbackQuery();
      const account = await this.accounts.findOne(accountId);
      pending.accountId = account.id;

      if (account.currency !== 'RUB') {
        // Валютный счёт — спрашиваем курс следующим сообщением
        pending.awaitingRate = true;
        this.pending.set(userId, pending);
        await ctx.editMessageText(
          `Счёт «${escapeHtml(account.name)}» в ${account.currency}.\n` +
            `Курс: сколько рублей за 1 ${account.currency}? Например: <code>90.5</code>`,
          { parse_mode: 'HTML' },
        );
        return;
      }
      await this.createAndConfirm(ctx, userId, pending);
      return;
    }

    await ctx.answerCallbackQuery();
  }

  // Категория выбрана: при нескольких счетах — шаг выбора счёта, иначе сразу запись
  private async afterCategoryChosen(
    ctx: Context,
    userId: number,
    pending: PendingExpense,
    rootId: string,
    subId: string | null,
  ) {
    pending.rootId = rootId;
    pending.subId = subId;
    this.pending.set(userId, pending);

    const active = (await this.accounts.list()).filter((a) => a.active);
    if (active.length <= 1) {
      await this.createAndConfirm(ctx, userId, pending);
      return;
    }

    const kb = new InlineKeyboard();
    // Основной первым — запись в один тап
    const ordered = [...active].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    ordered.forEach((a, i) => {
      const label = `${a.isDefault ? '✅ ' : ''}${a.name} (${a.currency})`;
      kb.text(label, `a:${a.id}`);
      if (i % 2 === 1) kb.row();
    });
    kb.row().text('Отмена', 'x');
    await ctx.editMessageText('С какого счёта?', { reply_markup: kb });
  }

  private async createAndConfirm(
    ctx: Context,
    userId: number,
    data: PendingExpense,
    rate?: number,
  ) {
    this.pending.delete(userId);
    const tx = await this.transactions.create({
      amount: data.amount,
      categoryId: data.rootId!,
      subcategoryId: data.subId ?? null,
      label: data.label,
      note: data.note,
      accountId: data.accountId,
      rate: rate ?? null,
    });

    const alert = await this.budgetAlert(data.rootId!);
    const text = formatConfirmation(tx, alert);
    // После ввода курса текстом редактировать нечего — отвечаем новым сообщением
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML' });
    }
  }

  // Предупреждение, если категория близка к лимиту или превысила его.
  private async budgetAlert(categoryId: string): Promise<string | undefined> {
    const status = await this.analytics.budgetStatus({ month: this.month() });
    const item = status.items.find((i) => i.categoryId === categoryId);
    if (!item || item.monthlyLimit <= 0) return undefined;
    const pct = Math.round((100 * item.fact) / item.monthlyLimit);
    if (item.overspent) {
      return `🔴 Бюджет «${escapeHtml(item.categoryName)}» превышен: ${formatAmount(
        item.fact,
      )} из ${formatAmount(item.monthlyLimit)} (${pct}%).`;
    }
    if (pct >= 80) {
      return `🟡 По «${escapeHtml(item.categoryName)}» израсходовано ${pct}%: ${formatAmount(
        item.fact,
      )} из ${formatAmount(item.monthlyLimit)}.`;
    }
    return undefined;
  }

  // ——— Статистика ———

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

  // ——— Вспомогательное ———

  private async expenseRoots(): Promise<CategoryNode[]> {
    const tree = await this.categories.tree();
    return tree.filter((c) => c.type === 'expense' && c.active);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private month(): string {
    return new Date().toISOString().slice(0, 7);
  }
}
