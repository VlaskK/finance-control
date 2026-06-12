import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AccountsModule } from './accounts/accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { BudgetsModule } from './budgets/budgets.module';
import { TagsModule } from './tags/tags.module';
import { RecurringModule } from './recurring/recurring.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DataModule } from './data/data.module';
import { InsightsModule } from './insights/insights.module';
import { BotModule } from './bot/bot.module';

@Module({
  imports: [
    DatabaseModule,
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,
    TagsModule,
    RecurringModule,
    AnalyticsModule,
    DataModule,
    InsightsModule,
    BotModule,
  ],
})
export class AppModule {}
