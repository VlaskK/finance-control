// Информационные команды без диалога: балансы счетов и сброс текущего диалога.

import { Injectable } from '@nestjs/common';
import { type Context } from 'grammy';
import { AccountsService } from '../../accounts/accounts.service';
import { formatAccounts } from '../format';
import { SessionStore } from '../session';

@Injectable()
export class InfoHandler {
  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: SessionStore,
  ) {}

  async accountsList(ctx: Context): Promise<void> {
    const active = (await this.accounts.list()).filter((a) => a.active);
    await ctx.reply(formatAccounts(active), { parse_mode: 'HTML' });
  }

  async cancel(ctx: Context): Promise<void> {
    this.sessions.clear(ctx.from!.id);
    await ctx.reply('Диалог сброшен. Жду новую трату, доход или команду.');
  }
}
