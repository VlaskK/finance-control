// Wizard перевода между счетами: категория (необязательна) → откуда → куда
// (или «вне счетов») → сумма → [курс] → [сумма зачисления] → сводка → запись.
// Последовательность шагов выводится из черновика чистой nextTransferStep()
// (transfer-steps.ts), сами правила валют зеркалят deriveMoney.

import { Injectable } from '@nestjs/common';
import { type Context, type InlineKeyboard } from 'grammy';
import { TransactionsService } from '../../transactions/transactions.service';
import { CategoriesService } from '../../categories/categories.service';
import { AccountsService } from '../../accounts/accounts.service';
import { parsePositiveNumber } from '../parse';
import { escapeHtml, formatAmount, formatConfirmation } from '../format';
import { SessionStore, type TransferDraft } from '../session';
import { CB, parseCb } from '../callbacks';
import { kbAccounts, kbCategoryRoots, kbConfirm, kbSubcategories } from '../keyboards';
import { needsToAmount, nextTransferStep, rateQuoteCurrency } from '../transfer-steps';

@Injectable()
export class TransferHandler {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionStore,
  ) {}

  // /transfer — старт wizard'а.
  async start(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const active = (await this.accounts.list()).filter((a) => a.active);
    if (active.length < 1) {
      await ctx.reply('Нет активных счетов.');
      return;
    }

    const draft: TransferDraft = { mode: 'transfer' };
    const roots = await this.transferRoots();

    // Категория переводу не обязательна — без подходящих категорий шаг пропускаем.
    if (!roots.length) {
      draft.categoryId = null;
      draft.subcategoryId = null;
      this.sessions.set(userId, draft);
      await this.prompt(ctx, draft);
      return;
    }

    this.sessions.set(userId, draft);
    await ctx.reply('Категория перевода:', {
      reply_markup: kbCategoryRoots(roots, { withNone: true }),
    });
  }

  // Текстовый ввод: сумма, курс или сумма зачисления — что сейчас ожидается по шагу.
  async handleText(ctx: Context, draft: TransferDraft): Promise<void> {
    const step = nextTransferStep(draft);
    if (step !== 'amount' && step !== 'rate' && step !== 'toAmount') return;

    const value = parsePositiveNumber(ctx.message?.text ?? '');
    if (value === null) {
      await ctx.reply('Введите число больше нуля, например: <code>500</code>', {
        parse_mode: 'HTML',
      });
      return;
    }

    if (step === 'amount') draft.amount = value;
    else if (step === 'rate') draft.rate = value;
    else draft.toAmount = value;

    this.sessions.set(ctx.from!.id, draft);
    await this.prompt(ctx, draft);
  }

  // Callback'и wizard'а; сессия уже проверена роутером.
  async handleCallback(ctx: Context, data: string, draft: TransferDraft): Promise<void> {
    const userId = ctx.from!.id;
    const { ns, args } = parseCb(data);
    const step = nextTransferStep(draft);

    if (ns === CB.category) {
      const rootId = args[0];
      if (rootId === '-') {
        draft.categoryId = null;
        draft.subcategoryId = null;
        await ctx.answerCallbackQuery();
        this.sessions.set(userId, draft);
        await this.prompt(ctx, draft);
        return;
      }

      const roots = await this.transferRoots();
      const root = roots.find((r) => r.id === rootId);
      const children = (root?.children ?? []).filter((c) => c.active);
      await ctx.answerCallbackQuery();

      if (children.length) {
        draft.categoryId = rootId; // подкатегория придёт следующим callback'ом
        this.sessions.set(userId, draft);
        await ctx.editMessageText('Подкатегория:', { reply_markup: kbSubcategories(children) });
        return;
      }
      draft.categoryId = rootId;
      draft.subcategoryId = null;
      this.sessions.set(userId, draft);
      await this.prompt(ctx, draft);
      return;
    }

    if (ns === CB.subcategory) {
      draft.subcategoryId = args[0] === '-' ? null : args[0];
      await ctx.answerCallbackQuery();
      this.sessions.set(userId, draft);
      await this.prompt(ctx, draft);
      return;
    }

    if (ns === CB.account) {
      await ctx.answerCallbackQuery();
      if (step === 'from') {
        const account = await this.accounts.findOne(args[0]);
        draft.fromId = account.id;
        draft.fromName = account.name;
        draft.fromCurrency = account.currency;
      } else if (step === 'to') {
        if (args[0] === '-') {
          draft.toId = null;
          draft.toName = null;
          draft.toCurrency = null;
        } else {
          const account = await this.accounts.findOne(args[0]);
          draft.toId = account.id;
          draft.toName = account.name;
          draft.toCurrency = account.currency;
        }
      }
      this.sessions.set(userId, draft);
      await this.prompt(ctx, draft);
      return;
    }

    if (ns === CB.confirm && step === 'confirm') {
      await ctx.answerCallbackQuery();
      await this.create(ctx, userId, draft);
      return;
    }

    await ctx.answerCallbackQuery();
  }

  // Показывает вопрос текущего шага. После callback'а редактируем сообщение,
  // после текстового ввода — отвечаем новым.
  private async prompt(ctx: Context, draft: TransferDraft): Promise<void> {
    const step = nextTransferStep(draft);
    const send = async (text: string, kb?: InlineKeyboard) => {
      const options = { parse_mode: 'HTML' as const, reply_markup: kb };
      if (ctx.callbackQuery) await ctx.editMessageText(text, options);
      else await ctx.reply(text, options);
    };

    const active = (await this.accounts.list()).filter((a) => a.active);

    switch (step) {
      case 'from':
        await send('Откуда (счёт списания)?', kbAccounts(active));
        return;
      case 'to':
        await send(
          'Куда (счёт зачисления)?',
          kbAccounts(active, { excludeId: draft.fromId, withOutside: true }),
        );
        return;
      case 'amount':
        await send(
          `Сумма в ${draft.fromCurrency}? Например: <code>500</code>`,
        );
        return;
      case 'rate': {
        const quote = rateQuoteCurrency(draft);
        await send(`Курс: сколько рублей за 1 ${quote}? Например: <code>90.5</code>`);
        return;
      }
      case 'toAmount':
        await send(
          `Сумма зачисления в ${draft.toCurrency}? Например: <code>450</code>`,
        );
        return;
      case 'confirm':
        await send(this.summary(draft), kbConfirm('✅ Перевести'));
        return;
      default:
        return;
    }
  }

  private summary(draft: TransferDraft): string {
    const amount = formatAmount(draft.amount!, draft.fromCurrency);
    const target = draft.toName ? escapeHtml(draft.toName) : 'вне счетов';
    const lines = [
      `Перевод <b>${amount}</b>`,
      `${escapeHtml(draft.fromName!)} → ${target}`,
    ];
    if (draft.rate != null) lines.push(`Курс: ${draft.rate}`);
    if (needsToAmount(draft) && draft.toAmount != null) {
      lines.push(`Зачислится: ${formatAmount(draft.toAmount, draft.toCurrency ?? 'RUB')}`);
    }
    lines.push('', 'Подтвердить?');
    return lines.join('\n');
  }

  private async create(ctx: Context, userId: number, draft: TransferDraft): Promise<void> {
    this.sessions.clear(userId);
    const tx = await this.transactions.create({
      amount: draft.amount!,
      categoryId: draft.categoryId ?? null,
      type: 'transfer', // без категории тип иначе не определить
      subcategoryId: draft.subcategoryId ?? null,
      label: null,
      note: null,
      accountId: draft.fromId,
      toAccountId: draft.toId ?? null,
      rate: draft.rate ?? null,
      toAmount: draft.toAmount ?? null,
    });
    await ctx.editMessageText(formatConfirmation(tx), { parse_mode: 'HTML' });
  }

  private async transferRoots() {
    const tree = await this.categories.tree();
    return tree.filter((c) => c.type === 'transfer' && c.active);
  }
}
