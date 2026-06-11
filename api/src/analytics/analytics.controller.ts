import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  analyticsByCategorySchema,
  budgetStatusSchema,
  dynamicsSchema,
  inflationSchema,
  type AnalyticsByCategoryDto,
  type BudgetStatusDto,
  type DynamicsDto,
  type InflationDto,
} from '../common/schemas';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // CALC-1 / FR-D2
  @Get('by-category')
  byCategory(
    @Query(new ZodValidationPipe(analyticsByCategorySchema)) dto: AnalyticsByCategoryDto,
  ) {
    return this.analytics.byCategory(dto);
  }

  // FR-D3
  @Get('series')
  series(
    @Query(new ZodValidationPipe(analyticsByCategorySchema)) dto: AnalyticsByCategoryDto,
  ) {
    return this.analytics.series(dto);
  }

  // CALC-3/4/5 / FR-E1…E3
  @Get('dynamics')
  dynamics(@Query(new ZodValidationPipe(dynamicsSchema)) dto: DynamicsDto) {
    return this.analytics.dynamics(dto);
  }

  // CALC-6 / FR-E4
  @Get('inflation')
  inflation(@Query(new ZodValidationPipe(inflationSchema)) dto: InflationDto) {
    return this.analytics.inflation(dto);
  }

  // CALC-2 / FR-D4
  @Get('budget-status')
  budgetStatus(@Query(new ZodValidationPipe(budgetStatusSchema)) dto: BudgetStatusDto) {
    return this.analytics.budgetStatus(dto);
  }
}
