import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AccountsModule } from '../accounts/accounts.module';
import { BotService } from './bot.service';
import { SessionStore } from './session';
import { EntryHandler } from './handlers/entry.handler';
import { TransferHandler } from './handlers/transfer.handler';
import { InfoHandler } from './handlers/info.handler';
import { StatsHandler } from './handlers/stats.handler';

@Module({
  imports: [TransactionsModule, CategoriesModule, AnalyticsModule, AccountsModule],
  providers: [BotService, SessionStore, EntryHandler, TransferHandler, InfoHandler, StatsHandler],
})
export class BotModule {}
