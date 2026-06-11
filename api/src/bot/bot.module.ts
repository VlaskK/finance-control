import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BotService } from './bot.service';

@Module({
  imports: [TransactionsModule, CategoriesModule, AnalyticsModule],
  providers: [BotService],
})
export class BotModule {}
