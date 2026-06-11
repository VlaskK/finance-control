import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Тип операции — глоссарий §3 / BR-10
export const transactionType = pgEnum('transaction_type', ['expense', 'transfer', 'income']);

// §8.6 categories — двухуровневое дерево с типами
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  type: transactionType('type').notNull(),
  parentId: uuid('parent_id'), // самоссылка задаётся через relations ниже
  description: text('description'), // BR-8
  color: text('color').notNull().default('#888888'),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true), // BR-3
});

// §8.6 recurring_items — BR-12
export const recurringItems = pgTable('recurring_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  isFixedPrice: boolean('is_fixed_price').notNull().default(false), // BR-12
});

// §8.6 transactions — BR-1 (ссылка по стабильному id)
export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  occurredAt: date('occurred_at').notNull(), // по умолчанию сегодня (задаётся на уровне сервиса)
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('RUB'),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id), // BR-1
  subcategoryId: uuid('subcategory_id').references(() => categories.id), // FR-A3
  label: text('label'), // FR-A4
  recurringId: uuid('recurring_id').references(() => recurringItems.id), // BR-12
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// §8.6 label_map — BR-7 обучаемый автовыбор
export const labelMap = pgTable('label_map', {
  label: text('label').primaryKey(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => categories.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// §8.6 tags — BR-9
export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
});

// §8.6 transaction_tags — M2M
export const transactionTags = pgTable(
  'transaction_tags',
  {
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.transactionId, t.tagId] }) }),
);

// §8.6 budgets — FR-F1
export const budgets = pgTable('budgets', {
  categoryId: uuid('category_id')
    .primaryKey()
    .references(() => categories.id),
  monthlyLimit: numeric('monthly_limit', { precision: 12, scale: 2 }).notNull(),
});

// Связи (для удобных join-запросов)
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_parent',
  }),
  children: many(categories, { relationName: 'category_parent' }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  subcategory: one(categories, {
    fields: [transactions.subcategoryId],
    references: [categories.id],
  }),
  tags: many(transactionTags),
}));

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type Tag = typeof tags.$inferSelect;
