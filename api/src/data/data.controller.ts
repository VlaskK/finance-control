import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { DataService } from './data.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  importCsvSchema,
  importJsonSchema,
  type ImportCsvDto,
  type ImportJsonDto,
} from '../common/schemas';

@Controller()
export class DataController {
  constructor(private readonly data: DataService) {}

  // FR-G1
  @Get('export')
  exportJson() {
    return this.data.exportJson();
  }

  // FR-G1 — CSV отдаётся текстом, файл сохраняет фронт
  @Get('export/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportCsv() {
    return this.data.exportCsv();
  }

  // FR-G2
  @Post('import')
  importCsv(@Body(new ZodValidationPipe(importCsvSchema)) dto: ImportCsvDto) {
    return this.data.importCsv(dto);
  }

  // FR-G3
  @Post('import/restore')
  restore(@Body(new ZodValidationPipe(importJsonSchema)) dto: ImportJsonDto) {
    return this.data.restoreJson(dto);
  }
}
