// Бюджеты: статус месяца + установка лимита из бота
// (выбор expense-категории → сумма текстом, 0 — снять лимит).

import { Injectable } from '@nestjs/common';
import { type Context } from 'grammy';
import { AnalyticsService } from '../../analytics/analytics.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { CategoriesService } from '../../categories/categories.service';
import { escapeHtml, formatAmount, formatBudget } from '../format';
import { SessionStore, type BudgetSetState } from '../session';
import { CB, parseCb } from '../callbacks';
import { kbBudget, kbCategoryRoots } from '../keyboards';

@Injectable()
export class BudgetHandler {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly budgets: BudgetsService,
    private readonly categories: CategoriesService,
    private readonly sessions: SessionStore,
  ) {}

  // /budget — статус текущего месяца + кнопка установки лимита.
  async command(ctx: Context): Promise<void> {
    const month = new Date().toISOString().slice(0, 7);
    const budget = await this.analytics.budgetStatus({ month });
    await ctx.reply(formatBudget(budget), { parse_mode: 'HTML', reply_markup: kbBudget() });
  }

  // b:s — начать установку лимита (stateless, сессию создаём сами).
  async handleCallback(ctx: Context): Promise<void> {
    await ctx.answerCallbackQuery();
    this.sessions.set(ctx.from!.id, { mode: 'budget_set' });
    const roots = (await this.categories.tree()).filter((c) => c.type === 'expense' && c.active);
    await ctx.editMessageText('Лимит для какой категории?', {
      reply_markup: kbCategoryRoots(roots),
    });
  }

  // Выбор категории (c: в режиме budget_set).
  async handlePickCallback(ctx: Context, data: string, state: BudgetSetState): Promise<void> {
    const { ns, args } = parseCb(data);
    if (ns !== CB.category) {
      await ctx.answerCallbackQuery();
      return;
    }
    const category = await this.categories.findOne(args[0]);
    state.categoryId = category.id;
    state.categoryName = category.name;
    this.sessions.set(ctx.from!.id, state);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Месячный лимит для «${escapeHtml(category.name)}»? Число, <code>0</code> — снять лимит.`,
      { parse_mode: 'HTML' },
    );
  }

  // Сумма лимита текстом.
  async handleText(ctx: Context, state: BudgetSetState): Promise<void> {
    if (!state.categoryId) return;
    const value = Number((ctx.message?.text ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) {
      await ctx.reply('Введите число (0 — снять лимит).');
      return;
    }

    this.sessions.clear(ctx.from!.id);
    await this.budgets.upsert({
      categoryId: state.categoryId,
      monthlyLimit: value === 0 ? null : value,
    });

    const confirmation =
      value === 0
        ? `Лимит для «${escapeHtml(state.categoryName ?? '')}» снят.`
        : `Лимит для «${escapeHtml(state.categoryName ?? '')}»: <b>${formatAmount(value)}</b>/мес.`;

    const month = new Date().toISOString().slice(0, 7);
    const budget = await this.analytics.budgetStatus({ month });
    await ctx.reply(`✅ ${confirmation}\n\n${formatBudget(budget)}`, {
      parse_mode: 'HTML',
      reply_markup: kbBudget(),
    });
  }
}
