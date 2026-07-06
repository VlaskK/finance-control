// Информационные команды без диалога: балансы счетов, отчёты по тегам,
// сброс текущего диалога.

import { Injectable } from '@nestjs/common';
import { type Context } from 'grammy';
import { AccountsService } from '../../accounts/accounts.service';
import { TagsService } from '../../tags/tags.service';
import { formatAccounts, formatTagReport } from '../format';
import { SessionStore } from '../session';
import { kbTags } from '../keyboards';

@Injectable()
export class InfoHandler {
  constructor(
    private readonly accounts: AccountsService,
    private readonly tags: TagsService,
    private readonly sessions: SessionStore,
  ) {}

  async accountsList(ctx: Context): Promise<void> {
    const active = (await this.accounts.list()).filter((a) => a.active);
    await ctx.reply(formatAccounts(active), { parse_mode: 'HTML' });
  }

  // /tags — кнопки тегов; создание/удаление тегов — в вебе.
  async tagsList(ctx: Context): Promise<void> {
    const all = await this.tags.list();
    if (!all.length) {
      await ctx.reply('Тегов нет. Создайте их в приложении.');
      return;
    }
    await ctx.reply('Отчёт по какому тегу?', { reply_markup: kbTags(all) });
  }

  // tg:<id> — отчёт по тегу (stateless).
  async tagReport(ctx: Context, tagId: string): Promise<void> {
    await ctx.answerCallbackQuery();
    const report = await this.tags.report(tagId);
    await ctx.editMessageText(formatTagReport(report), { parse_mode: 'HTML' });
  }

  async cancel(ctx: Context): Promise<void> {
    this.sessions.clear(ctx.from!.id);
    await ctx.reply('Диалог сброшен. Жду новую трату, доход или команду.');
  }
}
