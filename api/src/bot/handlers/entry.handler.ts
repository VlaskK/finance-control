// Диалог ввода траты или дохода: парс текста → (подсказка категории по метке | выбор
// категории) → подкатегория → счёт (если их несколько) → курс (если счёт валютный) → запись.
// Доход — тот же флоу с категориями типа income и без бюджетного алерта.

import { Injectable } from '@nestjs/common';
import { type Context } from 'grammy';
import { TransactionsService } from '../../transactions/transactions.service';
import { CategoriesService, type CategoryNode } from '../../categories/categories.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { AccountsService } from '../../accounts/accounts.service';
import { parseExpenseInput, parseIncomeInput, parsePositiveNumber } from '../parse';
import { escapeHtml, formatAmount, formatConfirmation } from '../format';
import { SessionStore, type EntryDraft } from '../session';
import { CB, parseCb } from '../callbacks';
import { kbAccounts, kbCategoryRoots, kbSubcategories, kbSuggestion } from '../keyboards';

@Injectable()
export class EntryHandler {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
    private readonly analytics: AnalyticsService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionStore,
  ) {}

  // Текстовый ввод: курс для валютного счёта, доход («+50000 зарплата») или трата.
  async handleText(ctx: Context): Promise<void> {
    const text = ctx.message?.text ?? '';
    const userId = ctx.from!.id;

    const session = this.sessions.get(userId);
    if (
      session &&
      (session.mode === 'expense' || session.mode === 'income') &&
      session.awaitingRate
    ) {
      const rate = parsePositiveNumber(text);
      if (rate === null) {
        await ctx.reply('Введите курс числом, например: <code>90.5</code>', {
          parse_mode: 'HTML',
        });
        return;
      }
      await this.createAndConfirm(ctx, userId, session, rate);
      return;
    }

    const income = parseIncomeInput(text);
    const parsed = income ?? parseExpenseInput(text);
    if (!parsed) {
      await ctx.reply(
        'Не понял сумму. Трата: <code>кофе 200</code>, доход: <code>+50000 зарплата</code>\n' +
          'Или /help для справки.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const draft: EntryDraft = { mode: income ? 'income' : 'expense', ...parsed };

    // BR-7 — пробуем предложить категорию по выученной метке (тип должен совпасть).
    if (parsed.label) {
      const suggestions = await this.transactions.suggestLabels(parsed.label);
      const top = suggestions[0];
      if (top) {
        const category = await this.categories.findOne(top.categoryId);
        if (category.type === draft.mode) {
          draft.suggestion = { categoryId: top.categoryId, subcategoryId: top.subcategoryId };
          this.sessions.set(userId, draft);
          await ctx.reply(
            `Записать ${draft.mode === 'income' ? 'доход ' : ''}<b>${formatAmount(parsed.amount)}</b>` +
              (parsed.label ? ` «${escapeHtml(parsed.label)}»` : '') +
              ` в категорию <b>${escapeHtml(category.name)}</b>?`,
            {
              parse_mode: 'HTML',
              reply_markup: kbSuggestion(category.name, formatAmount(parsed.amount)),
            },
          );
          return;
        }
      }
    }

    this.sessions.set(userId, draft);
    await this.askRootCategory(ctx, draft);
  }

  // Callback'и диалога; сессия уже проверена роутером.
  async handleCallback(ctx: Context, data: string, draft: EntryDraft): Promise<void> {
    const userId = ctx.from!.id;
    const { ns, args } = parseCb(data);

    if (ns === CB.confirm && draft.suggestion) {
      await ctx.answerCallbackQuery();
      await this.afterCategoryChosen(
        ctx,
        userId,
        draft,
        draft.suggestion.categoryId,
        draft.suggestion.subcategoryId,
      );
      return;
    }

    if (ns === CB.pickFull) {
      await ctx.answerCallbackQuery();
      await this.askRootCategory(ctx, draft);
      return;
    }

    if (ns === CB.category) {
      const rootId = args[0];
      const roots = await this.roots(draft.mode);
      const root = roots.find((r) => r.id === rootId);
      const children = (root?.children ?? []).filter((c) => c.active);
      await ctx.answerCallbackQuery();

      if (!children.length) {
        await this.afterCategoryChosen(ctx, userId, draft, rootId, null);
        return;
      }
      draft.rootId = rootId;
      this.sessions.set(userId, draft);
      await ctx.editMessageText('Выберите подкатегорию:', {
        reply_markup: kbSubcategories(children),
      });
      return;
    }

    if (ns === CB.subcategory) {
      const sub = args[0];
      await ctx.answerCallbackQuery();
      await this.afterCategoryChosen(ctx, userId, draft, draft.rootId!, sub === '-' ? null : sub);
      return;
    }

    if (ns === CB.account) {
      const accountId = args[0];
      await ctx.answerCallbackQuery();
      const account = await this.accounts.findOne(accountId);
      draft.accountId = account.id;

      if (account.currency !== 'RUB') {
        // Валютный счёт — спрашиваем курс следующим сообщением
        draft.awaitingRate = true;
        this.sessions.set(userId, draft);
        await ctx.editMessageText(
          `Счёт «${escapeHtml(account.name)}» в ${account.currency}.\n` +
            `Курс: сколько рублей за 1 ${account.currency}? Например: <code>90.5</code>`,
          { parse_mode: 'HTML' },
        );
        return;
      }
      await this.createAndConfirm(ctx, userId, draft);
      return;
    }

    await ctx.answerCallbackQuery();
  }

  private async askRootCategory(ctx: Context, draft: EntryDraft) {
    const roots = await this.roots(draft.mode);
    if (!roots.length) {
      await ctx.reply(
        draft.mode === 'income'
          ? 'Нет категорий доходов. Создайте их в приложении.'
          : 'Нет категорий расходов. Создайте их в приложении.',
      );
      return;
    }
    const what = draft.mode === 'income' ? 'дохода ' : '';
    await ctx.reply(
      `Выберите категорию ${what}для <b>${formatAmount(draft.amount)}</b>` +
        (draft.label ? ` «${escapeHtml(draft.label)}»` : ''),
      { parse_mode: 'HTML', reply_markup: kbCategoryRoots(roots) },
    );
  }

  // Категория выбрана: при нескольких счетах — шаг выбора счёта, иначе сразу запись
  private async afterCategoryChosen(
    ctx: Context,
    userId: number,
    draft: EntryDraft,
    rootId: string,
    subId: string | null,
  ) {
    draft.rootId = rootId;
    draft.subId = subId;
    this.sessions.set(userId, draft);

    const active = (await this.accounts.list()).filter((a) => a.active);
    if (active.length <= 1) {
      await this.createAndConfirm(ctx, userId, draft);
      return;
    }

    const question = draft.mode === 'income' ? 'На какой счёт?' : 'С какого счёта?';
    await ctx.editMessageText(question, { reply_markup: kbAccounts(active) });
  }

  private async createAndConfirm(ctx: Context, userId: number, draft: EntryDraft, rate?: number) {
    this.sessions.clear(userId);
    const tx = await this.transactions.create({
      amount: draft.amount,
      categoryId: draft.rootId!,
      subcategoryId: draft.subId ?? null,
      label: draft.label,
      note: draft.note,
      accountId: draft.accountId,
      rate: rate ?? null,
    });

    // Бюджеты считаются только по расходам.
    const alert = draft.mode === 'expense' ? await this.budgetAlert(draft.rootId!) : undefined;
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
    const month = new Date().toISOString().slice(0, 7);
    const status = await this.analytics.budgetStatus({ month });
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

  private async roots(type: 'expense' | 'income'): Promise<CategoryNode[]> {
    const tree = await this.categories.tree();
    return tree.filter((c) => c.type === type && c.active);
  }
}
