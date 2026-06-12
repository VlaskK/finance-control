import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createAccountSchema,
  setRateSchema,
  updateAccountSchema,
  type CreateAccountDto,
  type SetRateDto,
  type UpdateAccountDto,
} from '../common/schemas';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list() {
    return this.accounts.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createAccountSchema)) dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  // История процентных ставок (объявлено до :id-маршрутов ниже не требуется — пути не конфликтуют)
  @Get(':id/rates')
  listRates(@Param('id') id: string) {
    return this.accounts.listRates(id);
  }

  @Post(':id/rates')
  addRate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setRateSchema)) dto: SetRateDto,
  ) {
    return this.accounts.addRate(id, dto);
  }

  @Delete(':id/rates/:rateId')
  removeRate(@Param('id') id: string, @Param('rateId') rateId: string) {
    return this.accounts.removeRate(id, rateId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) dto: UpdateAccountDto,
  ) {
    return this.accounts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accounts.remove(id);
  }
}
