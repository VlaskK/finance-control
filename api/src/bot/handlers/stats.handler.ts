// Статистика за период: пресеты (сегодня/вчера/неделя/месяц/прошлый месяц/год),
// произвольный диапазон вводом дат, режим «с доходами», динамика по месяцам.
// Представление stateless: всё состояние вида — в callback_data (p:s:...), поэтому
// переключение периодов перерисовывает то же сообщение без сессии; сессия нужна
// только для ожидания текстового ввода диапазона (await_range).

import { Injectable } from '@nestjs/common';
import { type Context } from 'grammy';
import { AnalyticsService } from '../../analytics/analytics.service';
import { parseDateRange } from '../parse';
import { formatBudget, formatDynamics, formatStats, RANGE_HINT } from '../format';
import { SessionStore, type AwaitRangeState } from '../session';
import { CB, cb } from '../callbacks';
import { kbStats } from '../keyboards';
import { resolvePreset, type PresetKey } from '../stat-period';

type View =
  | { kind: 'preset'; preset: PresetKey; income: boolean }
  | { kind: 'range'; from: string; to: string; income: boolean };

// «2026-07-05» → «20260705» и обратно — компактные даты для callback_data.
const packDate = (iso: string) => iso.replaceAll('-', '');
const unpackDate = (packed: string) =>
  `${packed.slice(0, 4)}-${packed.slice(4, 6)}-${packed.slice(6, 8)}`;

@Injectable()
export class StatsHandler {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly sessions: SessionStore,
  ) {}

  // /stats /today /month — новое сообщение с отчётом и клавиатурой периодов.
  async command(ctx: Context, preset: PresetKey): Promise<void> {
    await this.render(ctx, { kind: 'preset', preset, income: false }, { edit: false });
  }

  // p:s:... — переключение периодов/режима доходов на месте.
  async handleCallback(ctx: Context, args: string[]): Promise<void> {
    await ctx.answerCallbackQuery();
    const income = args.at(-1) === 'i';
    const a = income ? args.slice(0, -1) : args;

    if (a[0] === 'c') {
      // Свой диапазон: просим даты текстом, режим доходов сохраняем в сессии.
      this.sessions.set(ctx.from!.id, { mode: 'await_range', income });
      await ctx.editMessageText(RANGE_HINT, { parse_mode: 'HTML' });
      return;
    }

    const view: View =
      a[0] === 'r'
        ? { kind: 'range', from: unpackDate(a[1]), to: unpackDate(a[2]), income }
        : { kind: 'preset', preset: a[0] as PresetKey, income };
    await this.render(ctx, view, { edit: true });
  }

  // dn:<месяцев> — динамика; клавиатура остаётся для возврата к периодам.
  async handleDynamics(ctx: Context, monthsArg: string): Promise<void> {
    await ctx.answerCallbackQuery();
    const months = monthsArg === '12' ? 12 : 6;

    const now = new Date();
    const to = now.toISOString().slice(0, 7);
    const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    const from = fromDate.toISOString().slice(0, 7);

    const data = await this.analytics.dynamics({ from, to, granularity: 'month' });
    await ctx.editMessageText(formatDynamics(data), {
      parse_mode: 'HTML',
      reply_markup: kbStats(false, cb(CB.period, 's', 'm', 'i')),
    });
  }

  // Ответ на «Свой диапазон»: две даты текстом.
  async handleRangeText(ctx: Context, session: AwaitRangeState): Promise<void> {
    const range = parseDateRange(ctx.message?.text ?? '');
    if (!range) {
      await ctx.reply(`Не понял диапазон. ${RANGE_HINT}`, { parse_mode: 'HTML' });
      return;
    }
    this.sessions.clear(ctx.from!.id);
    await this.render(
      ctx,
      { kind: 'range', ...range, income: session.income },
      { edit: false },
    );
  }

  private async render(ctx: Context, view: View, opts: { edit: boolean }): Promise<void> {
    const { from, to, title } = this.resolve(view);
    const data = await this.analytics.byCategoryRange({
      from: from ?? undefined,
      to: to ?? undefined,
      includeTransfers: false,
      includeIncome: view.income,
    });

    let text = formatStats(title, data, { income: view.income });

    // Для месячных периодов — план/факт бюджетов, как на фронте.
    if (from && view.kind === 'preset' && (view.preset === 'm' || view.preset === 'pm')) {
      const budget = await this.analytics.budgetStatus({ month: from.slice(0, 7) });
      text += `\n\n${formatBudget(budget)}`;
    }

    const kb = kbStats(view.income, this.toggleData(view));
    if (opts.edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // Границы и заголовок представления. Пресеты считаются от сегодняшней даты (UTC);
  // у «всего времени» границ нет (from/to = null).
  private resolve(view: View): { from: string | null; to: string | null; title: string } {
    if (view.kind === 'range') {
      return { ...view, title: `${view.from} — ${view.to}` };
    }
    return resolvePreset(view.preset);
  }

  // callback_data перерисовки текущего вида с противоположным флагом доходов.
  private toggleData(view: View): string {
    const flag = view.income ? [] : ['i'];
    if (view.kind === 'range') {
      return cb(CB.period, 's', 'r', packDate(view.from), packDate(view.to), ...flag);
    }
    return cb(CB.period, 's', view.preset, ...flag);
  }
}
