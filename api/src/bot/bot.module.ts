import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AccountsModule } from '../accounts/accounts.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { TagsModule } from '../tags/tags.module';
import { BotService } from './bot.service';
import { SessionStore } from './session';
import { EntryHandler } from './handlers/entry.handler';
import { TransferHandler } from './handlers/transfer.handler';
import { InfoHandler } from './handlers/info.handler';
import { StatsHandler } from './handlers/stats.handler';
import { HistoryHandler } from './handlers/history.handler';
import { EditHandler } from './handlers/edit.handler';
import { BudgetHandler } from './handlers/budget.handler';

@Module({
  imports: [
    TransactionsModule,
    CategoriesModule,
    AnalyticsModule,
    AccountsModule,
    BudgetsModule,
    TagsModule,
  ],
  providers: [
    BotService,
    SessionStore,
    EntryHandler,
    TransferHandler,
    InfoHandler,
    StatsHandler,
    HistoryHandler,
    EditHandler,
    BudgetHandler,
  ],
})
export class BotModule {}
