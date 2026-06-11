// Рендер текста для Telegram (parse_mode: HTML). Категории/метки приходят от пользователя,
// поэтому весь подставляемый текст экранируется.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatAmount(value: number, currency = 'RUB'): string {
  const symbol = currency === 'RUB' ? '₽' : currency;
  const num = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${num} ${symbol}`;
}

interface ByCategoryItem {
  name: string;
  type: string;
  amount: number;
  count: number;
  share: number | null;
}
interface ByCategoryResult {
  from: string;
  to: string;
  total: number;
  items: ByCategoryItem[];
}

// Разбивка трат по категориям за период (только расходы, как и total в сервисе).
export function formatBreakdown(title: string, data: ByCategoryResult): string {
  const expenses = data.items.filter((i) => i.type === 'expense');
  if (!expenses.length) {
    return `<b>${escapeHtml(title)}</b>\nЗа этот период трат нет.`;
  }
  const lines = expenses.map((i) => {
    const share = i.share !== null ? ` · ${i.share}%` : '';
    return `• ${escapeHtml(i.name)} — <b>${formatAmount(i.amount)}</b>${share}`;
  });
  return [
    `<b>${escapeHtml(title)}</b>`,
    `Всего: <b>${formatAmount(data.total)}</b>`,
    '',
    ...lines,
  ].join('\n');
}

interface BudgetItem {
  categoryId: string;
  categoryName: string;
  monthlyLimit: number;
  fact: number;
  overspent: boolean;
}
interface BudgetResult {
  month: string;
  items: BudgetItem[];
}

export function formatBudget(data: BudgetResult): string {
  if (!data.items.length) {
    return `<b>Бюджеты · ${escapeHtml(data.month)}</b>\nЛимиты по категориям не заданы.`;
  }
  const lines = data.items.map((i) => {
    const marker = i.overspent ? '🔴' : '🟢';
    const pct = i.monthlyLimit > 0 ? Math.round((100 * i.fact) / i.monthlyLimit) : 0;
    return `${marker} ${escapeHtml(i.categoryName)}: <b>${formatAmount(i.fact)}</b> из ${formatAmount(
      i.monthlyLimit,
    )} (${pct}%)`;
  });
  return [`<b>Бюджеты · ${escapeHtml(data.month)}</b>`, '', ...lines].join('\n');
}

interface CreatedTx {
  amount: string;
  currency: string;
  categoryName: string;
  subcategoryName: string | null;
  label: string | null;
}

export function formatConfirmation(tx: CreatedTx, budgetAlert?: string): string {
  const cat = tx.subcategoryName
    ? `${escapeHtml(tx.categoryName)} / ${escapeHtml(tx.subcategoryName)}`
    : escapeHtml(tx.categoryName);
  const label = tx.label ? ` «${escapeHtml(tx.label)}»` : '';
  let msg = `✅ Записал: <b>${formatAmount(Number(tx.amount), tx.currency)}</b> — ${cat}${label}`;
  if (budgetAlert) msg += `\n\n${budgetAlert}`;
  return msg;
}
