import { Body, Controller, Get, Put } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { upsertBudgetSchema, type UpsertBudgetDto } from '../common/schemas';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list() {
    return this.budgets.list();
  }

  @Put()
  upsert(@Body(new ZodValidationPipe(upsertBudgetSchema)) dto: UpsertBudgetDto) {
    return this.budgets.upsert(dto);
  }
}
