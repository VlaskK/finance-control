import { z } from 'zod';

// Общие Zod-схемы (контракт API). На фронте используется зеркальная копия
// в shared/api/schemas; здесь — источник правды для бэка (NFR-T1, FR-A6).

export const txTypeSchema = z.enum(['expense', 'transfer', 'income']);
export type TxType = z.infer<typeof txTypeSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД');

const isoMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Месяц в формате ГГГГ-ММ');

const uuid = z.string().uuid();

// Query-параметры приходят строками: 'false' не должно превращаться в true.
const boolParam = z.preprocess(
  (v) => v === true || v === 'true' || v === '1',
  z.boolean(),
);

// FR-A1 / FR-A6 — создание операции
export const createTransactionSchema = z.object({
  amount: z.coerce.number().positive('Введите сумму больше нуля'),
  categoryId: z.string().uuid('Выберите категорию'),
  subcategoryId: uuid.optional().nullable(),
  occurredAt: isoDate.optional(), // по умолчанию сегодня (FR-A2)
  label: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  currency: z.string().length(3).optional(),
  recurringId: uuid.optional().nullable(), // BR-12
  tagIds: z.array(uuid).max(20).optional(), // FR-A5 / BR-9
});

// FR-B2 — частичное обновление
export const updateTransactionSchema = createTransactionSchema.partial();

// FR-B4 / FR-B5 — фильтры и поиск по метке
export const listTransactionsSchema = z.object({
  type: txTypeSchema.optional(),
  categoryId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  tagId: uuid.optional(),
  q: z.string().trim().max(120).optional(),
});

// FR-A4 / BR-7 — автодополнение меток
export const labelQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

// FR-C1 — создание категории/подкатегории
export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Введите название'),
  type: txTypeSchema,
  parentId: uuid.optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  color: z.string().optional(),
  icon: z.string().optional().nullable(),
});

// FR-C2 / FR-C3 — переименование, архивирование
export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  color: z.string().optional(),
  icon: z.string().optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// FR-C4 / BR-5 — слияние
export const mergeCategorySchema = z.object({
  targetId: z.string().uuid('Выберите целевую категорию'),
});

// FR-F1 — лимит по категории; null снимает лимит
export const upsertBudgetSchema = z.object({
  categoryId: uuid,
  monthlyLimit: z.number().positive('Лимит должен быть больше нуля').nullable(),
});

// BR-9 — теги
export const createTagSchema = z.object({
  name: z.string().trim().min(1, 'Введите название тега').max(60),
});

// BR-12 — регулярные позиции
export const createRecurringSchema = z.object({
  name: z.string().trim().min(1, 'Введите название позиции').max(120),
  categoryId: uuid,
  isFixedPrice: z.boolean().optional().default(false),
});

export const updateRecurringSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  categoryId: uuid.optional(),
  isFixedPrice: z.boolean().optional(),
});

// CALC-1 (FR-D2) и временной ряд (FR-D3)
export const analyticsByCategorySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']),
  date: isoDate,
  includeTransfers: boolParam.optional().default(false), // FR-D5
  includeIncome: boolParam.optional().default(false), // FR-D5
});

// CALC-3/4/5 (FR-E1…E3)
export const dynamicsSchema = z.object({
  from: isoMonth,
  to: isoMonth,
  granularity: z.enum(['month', 'year']).optional().default('month'),
});

// CALC-6 (FR-E4)
export const inflationSchema = z.object({
  from: isoMonth,
  to: isoMonth,
});

// CALC-2 (FR-D4)
export const budgetStatusSchema = z.object({
  month: isoMonth,
});

// FR-G2 — импорт CSV (файл читается на фронте и передаётся текстом)
export const importCsvSchema = z.object({
  csv: z.string().min(1, 'Выберите непустой CSV-файл'),
  defaultType: txTypeSchema.optional().default('expense'),
});

// FR-G3 — восстановление из JSON-бэкапа (формат GET /export?format=json)
export const importJsonSchema = z.object({
  data: z.object({
    categories: z.array(z.record(z.any())),
    transactions: z.array(z.record(z.any())),
    recurringItems: z.array(z.record(z.any())).optional().default([]),
    labelMap: z.array(z.record(z.any())).optional().default([]),
    tags: z.array(z.record(z.any())).optional().default([]),
    transactionTags: z.array(z.record(z.any())).optional().default([]),
    budgets: z.array(z.record(z.any())).optional().default([]),
  }),
});

export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionDto = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsDto = z.infer<typeof listTransactionsSchema>;
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
export type MergeCategoryDto = z.infer<typeof mergeCategorySchema>;
export type UpsertBudgetDto = z.infer<typeof upsertBudgetSchema>;
export type CreateTagDto = z.infer<typeof createTagSchema>;
export type CreateRecurringDto = z.infer<typeof createRecurringSchema>;
export type UpdateRecurringDto = z.infer<typeof updateRecurringSchema>;
export type AnalyticsByCategoryDto = z.infer<typeof analyticsByCategorySchema>;
export type DynamicsDto = z.infer<typeof dynamicsSchema>;
export type InflationDto = z.infer<typeof inflationSchema>;
export type BudgetStatusDto = z.infer<typeof budgetStatusSchema>;
export type ImportCsvDto = z.infer<typeof importCsvSchema>;
export type ImportJsonDto = z.infer<typeof importJsonSchema>;
