import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createTransactionSchema,
  labelQuerySchema,
  listTransactionsSchema,
  updateTransactionSchema,
  type CreateTransactionDto,
  type ListTransactionsDto,
  type UpdateTransactionDto,
} from '../common/schemas';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createTransactionSchema)) dto: CreateTransactionDto,
  ) {
    return this.transactions.create(dto);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listTransactionsSchema)) filters: ListTransactionsDto,
  ) {
    return this.transactions.list(filters);
  }

  // FR-A4 / BR-7 — автодополнение меток (объявлен до :id, чтобы не конфликтовать)
  @Get('labels')
  suggestLabels(
    @Query(new ZodValidationPipe(labelQuerySchema)) query: { q: string },
  ) {
    return this.transactions.suggestLabels(query.q);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transactions.remove(id);
  }
}
