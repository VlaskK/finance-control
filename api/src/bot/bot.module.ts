import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AccountsModule } from '../accounts/accounts.module';
import { BotService } from './bot.service';
import { SessionStore } from './session';
import { EntryHandler } from './handlers/entry.handler';

@Module({
  imports: [TransactionsModule, CategoriesModule, AnalyticsModule, AccountsModule],
  providers: [BotService, SessionStore, EntryHandler],
})
export class BotModule {}
