import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AccountsModule } from '../accounts/accounts.module';
import { BotService } from './bot.service';

@Module({
  imports: [TransactionsModule, CategoriesModule, AnalyticsModule, AccountsModule],
  providers: [BotService],
})
export class BotModule {}
