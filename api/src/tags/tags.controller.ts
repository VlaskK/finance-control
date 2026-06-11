import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { TagsService } from './tags.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createTagSchema, type CreateTagDto } from '../common/schemas';

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list() {
    return this.tags.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTagSchema)) dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Get(':id/report')
  report(@Param('id') id: string) {
    return this.tags.report(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }
}
