// Карточка операции и редактирование: сумма/дата/метка/заметка — текстом,
// категория/счёт — пикерами, удаление — с подтверждением. Правки уходят в
// TransactionsService.update, который сам пере-выводит денежные поля (deriveMoney).

import { Injectable } from '@nestjs/common';
import { type Context } from 'grammy';
import { TransactionsService } from '../../transactions/transactions.service';
import { CategoriesService } from '../../categories/categories.service';
import { AccountsService } from '../../accounts/accounts.service';
import { parseDate, parsePositiveNumber } from '../parse';
import { escapeHtml, formatTxCard, formatTxLine, type TxRow } from '../format';
import { SessionStore, type EditState, type HistoryFilters } from '../session';
import { CB, parseCb } from '../callbacks';
import {
  kbCategoryRoots,
  kbConfirmDelete,
  kbEditDate,
  kbSubcategories,
  kbAccounts,
  kbTxCard,
} from '../keyboards';

@Injectable()
export class EditHandler {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionStore,
  ) {}

  // Открыть карточку (из списка истории или по протухшей кнопке e:*).
  async openCard(
    ctx: Context,
    txId: string,
    returnTo?: { filters: HistoryFilters; page: number },
  ): Promise<void> {
    const prev = this.sessions.get(ctx.from!.id);
    const keptReturn =
      returnTo ?? (prev?.mode === 'edit' ? prev.returnTo : undefined);
    this.sessions.set(ctx.from!.id, { mode: 'edit', txId, returnTo: keptReturn });
    await this.renderCard(ctx, txId, { edit: Boolean(ctx.callbackQuery) });
  }

  // e:<txId>:<поле> — выбор, что редактировать. Работает без сессии (txId в callback).
  async handleEditCallback(ctx: Context, data: string): Promise<void> {
    const { args } = parseCb(data);
    const [txId, field] = [args[0], args[1]];
    const userId = ctx.from!.id;

    const prev = this.sessions.get(userId);
    const state: EditState =
      prev?.mode === 'edit' && prev.txId === txId
        ? prev
        : { mode: 'edit', txId };
    delete state.field;
    delete state.accountId;

    await ctx.answerCallbackQuery();

    switch (field) {
      case 'a':
        state.field = 'amount';
        this.sessions.set(userId, state);
        await ctx.editMessageText('Новая сумма? Например: <code>350</code>', {
          parse_mode: 'HTML',
        });
        return;
      case 'd':
        state.field = 'date';
        this.sessions.set(userId, state);
        await ctx.editMessageText(
          'Новая дата? Кнопкой или текстом: <code>05.07</code> / <code>2026-07-05</code>',
          { parse_mode: 'HTML', reply_markup: kbEditDate() },
        );
        return;
      case 'l':
        state.field = 'label';
        this.sessions.set(userId, state);
        await ctx.editMessageText('Новая метка? («-» — убрать метку)');
        return;
      case 'n':
        state.field = 'note';
        this.sessions.set(userId, state);
        await ctx.editMessageText('Новая заметка? («-» — убрать заметку)');
        return;
      case 'c': {
        // смена категории: пикер корней того же типа операции
        const tx = (await this.transactions.findOne(txId)) as TxRow;
        const roots = (await this.categories.tree()).filter(
          (c) => c.type === tx.type && c.active,
        );
        this.sessions.set(userId, state);
        await ctx.editMessageText('Новая категория:', { reply_markup: kbCategoryRoots(roots) });
        return;
      }
      case 'w': {
        const active = (await this.accounts.list()).filter((a) => a.active);
        this.sessions.set(userId, state);
        await ctx.editMessageText('Новый счёт:', { reply_markup: kbAccounts(active) });
        return;
      }
      case 'x': {
        const tx = (await this.transactions.findOne(txId)) as TxRow;
        this.sessions.set(userId, state);
        await ctx.editMessageText(
          `Удалить операцию?\n${formatTxLine(tx, 1).slice(3)}`,
          { parse_mode: 'HTML', reply_markup: kbConfirmDelete(txId) },
        );
        return;
      }
      case 'xy':
        await this.transactions.remove(txId);
        this.sessions.clear(userId);
        await ctx.editMessageText('🗑 Операция удалена. /history — к списку.');
        return;
      default:
        await this.renderCard(ctx, txId, { edit: true });
    }
  }

  // ed:t / ed:y — быстрая дата.
  async handleDateShortcut(ctx: Context, arg: string, state: EditState): Promise<void> {
    await ctx.answerCallbackQuery();
    const date =
      arg === 'y'
        ? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    await this.applyUpdate(ctx, state, { occurredAt: date });
  }

  // Пикеры категории/счёта в режиме редактирования (c:/s:/a:).
  async handlePickCallback(ctx: Context, data: string, state: EditState): Promise<void> {
    const { ns, args } = parseCb(data);
    const userId = ctx.from!.id;

    if (ns === CB.category) {
      const rootId = args[0];
      const tx = (await this.transactions.findOne(state.txId)) as TxRow;
      const roots = (await this.categories.tree()).filter((c) => c.type === tx.type && c.active);
      const root = roots.find((r) => r.id === rootId);
      const children = (root?.children ?? []).filter((c) => c.active);
      await ctx.answerCallbackQuery();

      if (children.length) {
        state.rootId = rootId;
        this.sessions.set(userId, state);
        await ctx.editMessageText('Подкатегория:', { reply_markup: kbSubcategories(children) });
        return;
      }
      await this.applyUpdate(ctx, state, { categoryId: rootId, subcategoryId: null });
      return;
    }

    if (ns === CB.subcategory) {
      await ctx.answerCallbackQuery();
      await this.applyUpdate(ctx, state, {
        categoryId: state.rootId!,
        subcategoryId: args[0] === '-' ? null : args[0],
      });
      return;
    }

    if (ns === CB.account) {
      const account = await this.accounts.findOne(args[0]);
      await ctx.answerCallbackQuery();
      if (account.currency !== 'RUB') {
        // валютный счёт — нужен курс, иначе update() упадёт валидацией
        state.accountId = account.id;
        state.field = 'rate';
        this.sessions.set(userId, state);
        await ctx.editMessageText(
          `Счёт «${escapeHtml(account.name)}» в ${account.currency}.\n` +
            `Курс: сколько рублей за 1 ${account.currency}?`,
          { parse_mode: 'HTML' },
        );
        return;
      }
      await this.applyUpdate(ctx, state, { accountId: account.id, rate: null });
      return;
    }

    await ctx.answerCallbackQuery();
  }

  // Текстовый ввод редактируемого поля.
  async handleText(ctx: Context, state: EditState): Promise<void> {
    const text = (ctx.message?.text ?? '').trim();

    switch (state.field) {
      case 'amount': {
        const amount = parsePositiveNumber(text);
        if (amount === null) {
          await ctx.reply('Введите сумму числом больше нуля.');
          return;
        }
        await this.applyUpdate(ctx, state, { amount });
        return;
      }
      case 'date': {
        const date = parseDate(text);
        if (!date) {
          await ctx.reply('Не понял дату. Например: <code>05.07</code>', { parse_mode: 'HTML' });
          return;
        }
        await this.applyUpdate(ctx, state, { occurredAt: date });
        return;
      }
      case 'label':
        await this.applyUpdate(ctx, state, { label: text === '-' ? null : text.slice(0, 120) });
        return;
      case 'note':
        await this.applyUpdate(ctx, state, { note: text === '-' ? null : text.slice(0, 500) });
        return;
      case 'rate': {
        const rate = parsePositiveNumber(text);
        if (rate === null) {
          await ctx.reply('Введите курс числом, например: <code>90.5</code>', {
            parse_mode: 'HTML',
          });
          return;
        }
        await this.applyUpdate(ctx, state, { accountId: state.accountId, rate });
        return;
      }
      default:
        return;
    }
  }

  private async applyUpdate(
    ctx: Context,
    state: EditState,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await this.transactions.update(state.txId, patch);
    // Сбрасываем режим поля, карточка остаётся открытой для следующих правок.
    this.sessions.set(ctx.from!.id, {
      mode: 'edit',
      txId: state.txId,
      returnTo: state.returnTo,
    });
    await this.renderCard(ctx, state.txId, { edit: Boolean(ctx.callbackQuery) }, '✏️ Обновлено.\n\n');
  }

  private async renderCard(
    ctx: Context,
    txId: string,
    opts: { edit: boolean },
    prefix = '',
  ): Promise<void> {
    const tx = (await this.transactions.findOne(txId)) as TxRow;
    const text = prefix + formatTxCard(tx);
    const kb = kbTxCard(txId, tx.type);
    if (opts.edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }
}
