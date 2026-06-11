import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { categories, tags, transactionTags, transactions } from '../database/schema';
import type { CreateTagDto } from '../common/schemas';

@Injectable()
export class TagsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list() {
    return this.db.select().from(tags).orderBy(asc(tags.name));
  }

  async create(dto: CreateTagDto) {
    const [row] = await this.db.insert(tags).values({ name: dto.name }).returning();
    return row;
  }

  async remove(id: string) {
    await this.db.delete(tags).where(eq(tags.id, id)); // связи каскадятся
    return { deleted: true };
  }

  // BR-9 — отчёт по тегу: операции разных категорий, сгруппированные суммы
  async report(id: string) {
    const [tag] = await this.db.select().from(tags).where(eq(tags.id, id));
    if (!tag) throw new NotFoundException('Тег не найден');

    const rows = await this.db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        categoryColor: categories.color,
        type: categories.type,
        amount: sql<string>`sum(${transactions.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactionTags)
      .innerJoin(transactions, eq(transactionTags.transactionId, transactions.id))
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactionTags.tagId, id))
      .groupBy(categories.id, categories.name, categories.color, categories.type);

    const total = rows.reduce((acc, r) => acc + Number(r.amount), 0);
    return { tag, total, byCategory: rows };
  }
}
