import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccrualService } from './accrual.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccrualService],
  exports: [AccountsService],
})
export class AccountsModule {}
