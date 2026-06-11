import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createCategorySchema,
  mergeCategorySchema,
  updateCategorySchema,
  type CreateCategoryDto,
  type MergeCategoryDto,
  type UpdateCategoryDto,
} from '../common/schemas';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  tree() {
    return this.categories.tree();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto,
  ) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  // FR-C4 / BR-5
  @Post(':id/merge')
  merge(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mergeCategorySchema)) dto: MergeCategoryDto,
  ) {
    return this.categories.merge(id, dto);
  }

  // BR-4 — только пустые
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
