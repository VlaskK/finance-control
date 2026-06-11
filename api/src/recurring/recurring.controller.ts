import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createRecurringSchema,
  updateRecurringSchema,
  type CreateRecurringDto,
  type UpdateRecurringDto,
} from '../common/schemas';

@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  list() {
    return this.recurring.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createRecurringSchema)) dto: CreateRecurringDto) {
    return this.recurring.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecurringSchema)) dto: UpdateRecurringDto,
  ) {
    return this.recurring.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.recurring.remove(id);
  }
}
