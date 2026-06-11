import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { budgets, categories } from '../database/schema';
import type { UpsertBudgetDto } from '../common/schemas';

@Injectable()
export class BudgetsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // FR-F1 — лимиты с именами категорий для отображения
  async list() {
    return this.db
      .select({
        categoryId: budgets.categoryId,
        monthlyLimit: budgets.monthlyLimit,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id));
  }

  // FR-F1 — установка лимита; null снимает лимит
  async upsert(dto: UpsertBudgetDto) {
    if (dto.monthlyLimit === null) {
      await this.db.delete(budgets).where(eq(budgets.categoryId, dto.categoryId));
      return { categoryId: dto.categoryId, monthlyLimit: null };
    }
    const [row] = await this.db
      .insert(budgets)
      .values({ categoryId: dto.categoryId, monthlyLimit: dto.monthlyLimit.toFixed(2) })
      .onConflictDoUpdate({
        target: budgets.categoryId,
        set: { monthlyLimit: dto.monthlyLimit.toFixed(2) },
      })
      .returning();
    return row;
  }
}
