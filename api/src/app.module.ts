import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { BudgetsModule } from './budgets/budgets.module';
import { TagsModule } from './tags/tags.module';
import { RecurringModule } from './recurring/recurring.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DataModule } from './data/data.module';
import { InsightsModule } from './insights/insights.module';

@Module({
  imports: [
    DatabaseModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,
    TagsModule,
    RecurringModule,
    AnalyticsModule,
    DataModule,
    InsightsModule,
  ],
})
export class AppModule {}
