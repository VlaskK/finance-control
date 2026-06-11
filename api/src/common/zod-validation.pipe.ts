import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

// Валидация входных данных через Zod (FR-A6 / NFR-U2).
// Ошибки отдаются по полям в формулировке "что сделать".
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      throw new BadRequestException({ message: 'Проверьте поля формы', fieldErrors });
    }
    return result.data;
  }
}
