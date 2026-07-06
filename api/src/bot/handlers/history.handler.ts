// Список операций (/history): страница из 10 строк, кнопки-номера открывают карточку,
// фильтры тип/категория/счёт/период/поиск. Фильтры и страница живут в сессии,
// в callback_data — только короткие действия (лимит 64 байта).

import { Injectable } from '@nestjs/common';
import { type Context } from 'grammy';
import { TransactionsService } from '../../transactions/transactions.service';
import { CategoriesService } from '../../categories/categories.service';
import { AccountsService } from '../../accounts/accounts.service';
import { periodRange } from '../../analytics/periods';
import { parseDateRange } from '../parse';
import { formatHistoryHeader, formatTxLine, type TxRow } from '../format';
import { SessionStore, type HistoryFilters, type HistoryState } from '../session';
import { CB, parseCb } from '../callbacks';
import { kbAccounts, kbCategoryRoots, kbHistory, kbHistoryFilters } from '../keyboards';
import { EditHandler } from './edit.handler';

const PAGE_SIZE = 10;

@Injectable()
export class HistoryHandler {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionStore,
    private readonly edit: EditHandler,
  ) {}

  // /history — операции текущего месяца, первая страница.
  async command(ctx: Context): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const state: HistoryState = {
      mode: 'history',
      filters: { ...periodRange('month', today) },
      page: 0,
    };
    this.sessions.set(ctx.from!.id, state);
    await this.render(ctx, state, { edit: false });
  }

  // h:* — навигация и фильтры. Работает и после протухания сессии:
  // h:o (карточка) самодостаточен, остальное просит открыть /history заново.
  async handleCallback(ctx: Context, data: string): Promise<void> {
    const userId = ctx.from!.id;
    const { args } = parseCb(data);
    const action = args[0];

    // Открыть карточку — txId в callback, сессия не обязательна.
    if (action === 'o') {
      await ctx.answerCallbackQuery();
      const prev = this.sessions.get(userId);
      const returnTo =
        prev?.mode === 'history' ? { filters: prev.filters, page: prev.page } : undefined;
      await this.edit.openCard(ctx, args[1], returnTo);
      return;
    }

    const session = this.sessions.get(userId);
    let state: HistoryState;
    if (session?.mode === 'history') {
      state = session;
    } else if (action === 'b') {
      // «К списку» из протухшей карточки — свежий список по умолчанию.
      const today = new Date().toISOString().slice(0, 10);
      state = { mode: 'history', filters: { ...periodRange('month', today) }, page: 0 };
    } else {
      await ctx.answerCallbackQuery({ text: 'Сессия истекла — откройте /history заново.' });
      return;
    }

    await ctx.answerCallbackQuery();
    delete state.awaiting;

    switch (action) {
      case 'p': // страница
        state.page = Math.max(0, Number(args[1]) || 0);
        break;
      case 'f': // меню фильтров
        this.sessions.set(userId, state);
        await ctx.editMessageText('Фильтры списка:', { reply_markup: kbHistoryFilters() });
        return;
      case 'ft': // тип
        state.filters.type =
          args[1] === 'e' ? 'expense' : args[1] === 'i' ? 'income' : args[1] === 't' ? 'transfer' : undefined;
        state.page = 0;
        break;
      case 'fc': {
        // фильтр по категории: пикер корневых (всех типов)
        state.picking = 'category';
        this.sessions.set(userId, state);
        const roots = (await this.categories.tree()).filter((c) => c.active);
        await ctx.editMessageText('Категория для фильтра:', {
          reply_markup: kbCategoryRoots(roots),
        });
        return;
      }
      case 'fa': {
        state.picking = 'account';
        this.sessions.set(userId, state);
        const active = (await this.accounts.list()).filter((a) => a.active);
        await ctx.editMessageText('Счёт для фильтра:', { reply_markup: kbAccounts(active) });
        return;
      }
      case 'fq':
        state.awaiting = 'query';
        this.sessions.set(userId, state);
        await ctx.editMessageText('Пришлите текст для поиска по метке:');
        return;
      case 'fd': // период
        if (args[1] === 'c') {
          state.awaiting = 'range';
          this.sessions.set(userId, state);
          await ctx.editMessageText(
            'Пришлите две даты — начало и конец, например: <code>01.06 30.06</code>',
            { parse_mode: 'HTML' },
          );
          return;
        }
        this.applyPeriodPreset(state.filters, args[1]);
        state.page = 0;
        break;
      case 'fx': // сброс
        state.filters = {};
        state.page = 0;
        break;
      case 'b': // назад к списку
        break;
    }

    this.sessions.set(userId, state);
    await this.render(ctx, state, { edit: true });
  }

  // Пикеры категории/счёта в режиме фильтра (c:/a: при session.picking).
  async handlePickCallback(ctx: Context, data: string, state: HistoryState): Promise<void> {
    const { ns, args } = parseCb(data);
    await ctx.answerCallbackQuery();

    if (ns === CB.category && state.picking === 'category') {
      const category = await this.categories.findOne(args[0]);
      state.filters.categoryId = category.id;
      state.filters.categoryName = category.name;
    } else if (ns === CB.account && state.picking === 'account') {
      const account = await this.accounts.findOne(args[0]);
      state.filters.accountId = account.id;
      state.filters.accountName = account.name;
    }
    delete state.picking;
    state.page = 0;
    this.sessions.set(ctx.from!.id, state);
    await this.render(ctx, state, { edit: true });
  }

  // Текстовый ввод: поисковый запрос или произвольный период.
  async handleText(ctx: Context, state: HistoryState): Promise<void> {
    const text = (ctx.message?.text ?? '').trim();
    if (state.awaiting === 'range') {
      const range = parseDateRange(text);
      if (!range) {
        await ctx.reply('Не понял. Две даты, например: <code>01.06 30.06</code>', {
          parse_mode: 'HTML',
        });
        return;
      }
      state.filters.from = range.from;
      state.filters.to = range.to;
    } else {
      state.filters.q = text.slice(0, 120);
    }
    delete state.awaiting;
    state.page = 0;
    this.sessions.set(ctx.from!.id, state);
    await this.render(ctx, state, { edit: false });
  }

  async render(ctx: Context, state: HistoryState, opts: { edit: boolean }): Promise<void> {
    const { categoryName, accountName, ...apiFilters } = state.filters;
    const page = await this.transactions.listPaged({
      ...apiFilters,
      limit: PAGE_SIZE,
      offset: state.page * PAGE_SIZE,
    });

    const pages = Math.max(1, Math.ceil(page.total / PAGE_SIZE));
    const items = page.items as TxRow[];
    const lines = [formatHistoryHeader(state.filters, page.total, state.page, pages)];
    if (!items.length) {
      lines.push('', 'Операций не найдено. Измените фильтры.');
    } else {
      lines.push('', ...items.map((tx, i) => formatTxLine(tx, i + 1)));
      lines.push('', 'Номер операции — открыть и отредактировать.');
    }

    const kb = kbHistory(items.map((t) => t.id), state.page, pages);
    const text = lines.join('\n');
    if (opts.edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  private applyPeriodPreset(filters: HistoryFilters, preset: string): void {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === '-') {
      delete filters.from;
      delete filters.to;
      return;
    }
    if (preset === 'pm') {
      const now = new Date();
      const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
        .toISOString()
        .slice(0, 10);
      Object.assign(filters, periodRange('month', prev));
      return;
    }
    Object.assign(filters, periodRange('month', today));
  }
}
