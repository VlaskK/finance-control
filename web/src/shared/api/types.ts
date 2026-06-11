// Типы контракта API — зеркало Zod-схем бэка (api/src/common/schemas.ts)

export type TxType = 'expense' | 'transfer' | 'income';

export const TX_TYPE_LABELS: Record<TxType, string> = {
  expense: 'Расход',
  transfer: 'Перевод',
  income: 'Доход',
};

export interface Category {
  id: string;
  name: string;
  type: TxType;
  parentId: string | null;
  description: string | null;
  color: string;
  icon: string | null;
  sortOrder: number;
  active: boolean;
}

export interface CategoryNode extends Category {
  children: Category[];
}

export interface TagRef {
  id: string;
  name: string;
}

export interface TransactionRow {
  id: string;
  amount: string;
  occurredAt: string;
  currency: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  type: TxType;
  subcategoryId: string | null;
  subcategoryName: string | null;
  label: string | null;
  note: string | null;
  recurringId: string | null;
  createdAt: string;
  tags: TagRef[];
}

export interface CreateTransactionInput {
  amount: number;
  categoryId: string;
  subcategoryId?: string | null;
  occurredAt?: string;
  label?: string | null;
  note?: string | null;
  recurringId?: string | null;
  tagIds?: string[];
}

export type UpdateTransactionInput = Partial<CreateTransactionInput>;

export interface TransactionFilters {
  type?: TxType;
  categoryId?: string;
  from?: string;
  to?: string;
  tagId?: string;
  q?: string;
}

export interface LabelSuggestion {
  label: string;
  categoryId: string;
  subcategoryId: string | null;
  updatedAt: string;
}

export interface BudgetRow {
  categoryId: string;
  monthlyLimit: string;
  categoryName: string;
  categoryColor: string;
}

export interface RecurringItem {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  isFixedPrice: boolean;
  txCount: number;
}

export type Period = 'day' | 'week' | 'month' | 'year';

export interface ByCategoryItem {
  categoryId: string;
  name: string;
  color: string;
  type: TxType;
  amount: number;
  count: number;
  share: number | null;
}

export interface ByCategoryResponse {
  from: string;
  to: string;
  total: number;
  items: ByCategoryItem[];
}

export interface SeriesResponse {
  buckets: string[];
  categories: { categoryId: string; name: string; color: string }[];
  points: { bucket: string; categoryId: string; amount: number }[];
}

export interface Decomposition {
  freq: number;
  ticket: number;
  cross: number;
  total: number;
}

export interface DynamicsPoint {
  period: string;
  spend: number;
  count: number;
  avgTicket: number | null;
  avgTicketSmoothed: number | null;
  spendIndex: number | null;
  changePct: number | null;
  decomposition: Decomposition | null;
}

export interface DynamicsCategory {
  categoryId: string;
  name: string;
  color: string;
  points: DynamicsPoint[];
}

export interface DynamicsResponse {
  periods: string[];
  granularity: 'month' | 'year';
  categories: DynamicsCategory[];
}

export interface InflationResponse {
  available: boolean;
  fixedItemsTotal: number;
  months: string[];
  items: { id: string; name: string; basePrice: number; weight: number }[];
  cpi: { month: string; value: number | null; mom: number | null; yoy: number | null }[];
}

export interface BudgetStatusItem {
  categoryId: string;
  monthlyLimit: number;
  categoryName: string;
  categoryColor: string;
  fact: number;
  variance: number;
  overspent: boolean;
}

export interface BudgetStatusResponse {
  month: string;
  items: BudgetStatusItem[];
}

export interface TagReport {
  tag: TagRef;
  total: number;
  byCategory: {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    type: TxType;
    amount: string;
    count: number;
  }[];
}

export interface ImportResult {
  imported: number;
  skipped: { line: number; reason: string }[];
}
