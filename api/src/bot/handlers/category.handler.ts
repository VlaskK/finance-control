// FR-D6 — суммы по категориям и подкатегориям за период или за всё время.
// Представление stateless: период целиком лежит в callback_data одним токеном
// (ct:l:<период> — список, ct:c:<uuid>:<период> — одна категория), поэтому кнопки
// в старых сообщениях продолжают работать. Сессия нужна только чтобы дождаться
// текста со своим диапазоном (await_cat_range).

import { Injectable } from '@nestjs/common';
import { type Context } from 'grammy';
import { AnalyticsService } from '../../analytics/analytics.service';
import { parseDateRange } from '../parse';
import { escapeHtml, formatCategoryDetail, formatCategoryTotals, RANGE_HINT } from '../format';
import { SessionStore, type AwaitCatRangeState } from '../session';
import { kbCategoryDetail, kbCategoryTotals } from '../keyboards';
import { decodePeriod, encodePeriod, resolvePeriod, type StatPeriod } from '../stat-period';

@Injectable()
export class CategoryHandler {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly sessions: SessionStore,
  ) {}

  // /categories — список категорий с суммами за текущий месяц.
  async command(ctx: Context): Promise<void> {
    await this.renderList(ctx, { kind: 'preset', preset: 'm' }, { edit: false });
  }

  // ct:* — смена периода, переход в категорию, запрос своего диапазона.
  async handleCallback(ctx: Context, args: string[]): Promise<void> {
    await ctx.answerCallbackQuery();
    const [action, ...rest] = args;

    if (action === 'c') {
      await this.renderDetail(ctx, rest[0], decodePeriod(rest[1]), { edit: true });
      return;
    }
    if (action === 'r') {
      // Куда вернуться после ввода дат — в сессию: в callback_data места уже нет.
      this.sessions.set(ctx.from!.id, {
        mode: 'await_cat_range',
        categoryId: rest[0] ?? null,
      });
      await ctx.editMessageText(RANGE_HINT, { parse_mode: 'HTML' });
      return;
    }
    await this.renderList(ctx, decodePeriod(rest[0]), { edit: true });
  }

  // Ответ на «Свой диапазон»: две даты текстом.
  async handleRangeText(ctx: Context, session: AwaitCatRangeState): Promise<void> {
    const range = parseDateRange(ctx.message?.text ?? '');
    if (!range) {
      await ctx.reply(`Не понял диапазон. ${RANGE_HINT}`, { parse_mode: 'HTML' });
      return;
    }
    this.sessions.clear(ctx.from!.id);
    const period: StatPeriod = { kind: 'range', ...range };
    if (session.categoryId) {
      await this.renderDetail(ctx, session.categoryId, period, { edit: false });
    } else {
      await this.renderList(ctx, period, { edit: false });
    }
  }

  private async renderList(
    ctx: Context,
    period: StatPeriod,
    opts: { edit: boolean },
  ): Promise<void> {
    const { from, to, title } = resolvePeriod(period);
    const data = await this.analytics.categoryTotals({ from: from ?? undefined, to: to ?? undefined });

    // Кнопками — только то, что показано в отчёте: расходы и доходы.
    const buttons = data.items
      .filter((i) => i.type !== 'transfer')
      .map((i) => ({ id: i.categoryId, name: i.name }));

    await this.send(ctx, formatCategoryTotals(title, data), kbCategoryTotals(encodePeriod(period), buttons), opts);
  }

  private async renderDetail(
    ctx: Context,
    categoryId: string,
    period: StatPeriod,
    opts: { edit: boolean },
  ): Promise<void> {
    const { from, to, title } = resolvePeriod(period);
    const data = await this.analytics.categoryTotals({ from: from ?? undefined, to: to ?? undefined });
    const item = data.items.find((i) => i.categoryId === categoryId);

    const text = item
      ? formatCategoryDetail(title, item)
      : `📂 <b>${escapeHtml(title)}</b>\nЗа этот период по категории операций нет.`;
    await this.send(ctx, text, kbCategoryDetail(encodePeriod(period), categoryId), opts);
  }

  private async send(
    ctx: Context,
    text: string,
    reply_markup: ReturnType<typeof kbCategoryTotals>,
    opts: { edit: boolean },
  ): Promise<void> {
    if (opts.edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    }
  }
}
