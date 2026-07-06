// Рендер текста для Telegram (parse_mode: HTML). Категории/метки приходят от пользователя,
// поэтому весь подставляемый текст экранируется.

import { type HistoryFilters } from './session';

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

// Мини-бар из символов для моноширинных строк отчёта.
export function bar(value: number, max: number, width = 8): string {
  if (max <= 0 || value <= 0) return '░'.repeat(width);
  const filled = Math.min(width, Math.max(1, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// Имя фиксированной ширины для колонки (обрезка с многоточием).
function fitName(name: string, width = 10): string {
  const cut = name.length > width ? `${name.slice(0, width - 1)}…` : name;
  return cut.padEnd(width, ' ');
}

interface StatsData {
  from: string;
  to: string;
  total: number;
  items: Array<{ name: string; type: string; amount: number; count: number; share: number | null }>;
}

// Отчёт «Расходы (и доходы) за период» с барами; строки моноширинные.
export function formatStats(title: string, data: StatsData, opts: { income: boolean }): string {
  const expenses = data.items.filter((i) => i.type === 'expense');
  const maxExpense = Math.max(...expenses.map((i) => i.amount), 0);

  const lines: string[] = [`📊 <b>Расходы · ${escapeHtml(title)}</b>`];
  if (!expenses.length) {
    lines.push('За этот период трат нет.');
  } else {
    lines.push(`Всего: <b>${formatAmount(data.total)}</b>`, '');
    for (const i of expenses) {
      const share = i.share !== null ? ` · ${Math.round(i.share)}%` : '';
      lines.push(
        `<code>${escapeHtml(fitName(i.name))} ${bar(i.amount, maxExpense)} ${formatAmount(
          i.amount,
        )}${share}</code>`,
      );
    }
  }

  if (opts.income) {
    const incomes = data.items.filter((i) => i.type === 'income');
    const totalIncome = incomes.reduce((acc, i) => acc + i.amount, 0);
    const maxIncome = Math.max(...incomes.map((i) => i.amount), 0);
    lines.push('', `💰 <b>Доходы</b>: <b>${formatAmount(totalIncome)}</b>`);
    if (!incomes.length) {
      lines.push('За этот период доходов нет.');
    } else {
      for (const i of incomes) {
        lines.push(
          `<code>${escapeHtml(fitName(i.name))} ${bar(i.amount, maxIncome)} ${formatAmount(
            i.amount,
          )}</code>`,
        );
      }
      lines.push('', `Баланс: <b>${formatAmount(totalIncome - data.total)}</b>`);
    }
  }

  return lines.join('\n');
}

interface DynamicsData {
  periods: string[];
  categories: Array<{
    name: string;
    points: Array<{ period: string; spend: number }>;
  }>;
}

// Динамика: итог расходов по месяцам с барами + заметные изменения последнего месяца.
export function formatDynamics(data: DynamicsData): string {
  const totals = data.periods.map((period) =>
    data.categories.reduce(
      (acc, c) => acc + (c.points.find((p) => p.period === period)?.spend ?? 0),
      0,
    ),
  );
  const max = Math.max(...totals, 0);

  const lines = [`📈 <b>Динамика расходов · ${data.periods.length} мес</b>`, ''];
  data.periods.forEach((period, i) => {
    lines.push(`<code>${period} ${bar(totals[i], max)} ${formatAmount(totals[i])}</code>`);
  });

  // Топ изменений последнего месяца к предыдущему.
  if (data.periods.length >= 2) {
    const last = data.periods.at(-1)!;
    const prev = data.periods.at(-2)!;
    const changes = data.categories
      .map((c) => {
        const lastSpend = c.points.find((p) => p.period === last)?.spend ?? 0;
        const prevSpend = c.points.find((p) => p.period === prev)?.spend ?? 0;
        if (prevSpend <= 0) return null;
        const pct = Math.round(((lastSpend - prevSpend) / prevSpend) * 100);
        return { name: c.name, pct };
      })
      .filter((c): c is { name: string; pct: number } => c !== null && c.pct !== 0)
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 3);

    if (changes.length) {
      lines.push(
        '',
        `К прошлому месяцу: ${changes
          .map((c) => `${escapeHtml(c.name)} ${c.pct > 0 ? '+' : ''}${c.pct}%`)
          .join(' · ')}`,
      );
    }
  }

  return lines.join('\n');
}

interface CreatedTx {
  type?: string;
  amount: string;
  currency: string;
  baseAmount: string;
  accountName: string;
  toAccountName?: string | null;
  toAmount?: string | null;
  toCurrency?: string | null;
  categoryName: string;
  subcategoryName: string | null;
  label: string | null;
}

const CONFIRM_VERB: Record<string, string> = {
  expense: '✅ Записал',
  income: '✅ Доход',
  transfer: '✅ Перевод',
};

export function formatConfirmation(tx: CreatedTx, budgetAlert?: string): string {
  const cat = tx.subcategoryName
    ? `${escapeHtml(tx.categoryName)} / ${escapeHtml(tx.subcategoryName)}`
    : escapeHtml(tx.categoryName);
  const label = tx.label ? ` «${escapeHtml(tx.label)}»` : '';
  const fx = tx.currency !== 'RUB' ? ` ≈ ${formatAmount(Number(tx.baseAmount))}` : '';
  const verb = CONFIRM_VERB[tx.type ?? 'expense'] ?? CONFIRM_VERB.expense;
  let msg =
    `${verb}: <b>${formatAmount(Number(tx.amount), tx.currency)}</b>${fx} — ${cat}${label}`;

  if (tx.type === 'transfer') {
    // Маршрут: источник → получатель (или «вне счетов») с суммой зачисления.
    const target = tx.toAccountName
      ? `${escapeHtml(tx.toAccountName)}` +
        (tx.toAmount ? ` (зачислено ${formatAmount(Number(tx.toAmount), tx.toCurrency ?? 'RUB')})` : '')
      : 'вне счетов';
    msg += `\n${escapeHtml(tx.accountName)} → ${target}`;
  } else {
    msg += `\nСчёт: ${escapeHtml(tx.accountName)}`;
  }

  if (budgetAlert) msg += `\n\n${budgetAlert}`;
  return msg;
}

// Строка операции в списке /history и полная карточка.
export interface TxRow {
  id: string;
  type: string;
  amount: string;
  currency: string;
  baseAmount: string;
  occurredAt: string;
  accountName: string;
  toAccountName?: string | null;
  toAmount?: string | null;
  toCurrency?: string | null;
  categoryName: string;
  subcategoryName: string | null;
  label: string | null;
  note?: string | null;
  rate?: string | null;
}

const TYPE_SIGN: Record<string, string> = { expense: '−', income: '+', transfer: '→' };

// «1. 05.07 −350 ₽ Еда · кофе» — компактная строка списка.
export function formatTxLine(tx: TxRow, index: number): string {
  const day = tx.occurredAt.slice(8, 10);
  const month = tx.occurredAt.slice(5, 7);
  const sign = TYPE_SIGN[tx.type] ?? '';
  const what =
    tx.type === 'transfer'
      ? `${escapeHtml(tx.accountName)} → ${tx.toAccountName ? escapeHtml(tx.toAccountName) : 'вне счетов'}`
      : escapeHtml(tx.categoryName) + (tx.label ? ` · ${escapeHtml(tx.label)}` : '');
  return `${index}. ${day}.${month}  ${sign}${formatAmount(Number(tx.amount), tx.currency)}  ${what}`;
}

// Полная карточка операции для просмотра/редактирования.
export function formatTxCard(tx: TxRow): string {
  const kind =
    tx.type === 'income' ? '💰 Доход' : tx.type === 'transfer' ? '🔁 Перевод' : '💸 Трата';
  const fx = tx.currency !== 'RUB' ? ` ≈ ${formatAmount(Number(tx.baseAmount))}` : '';
  const cat = tx.subcategoryName
    ? `${escapeHtml(tx.categoryName)} / ${escapeHtml(tx.subcategoryName)}`
    : escapeHtml(tx.categoryName);

  const lines = [
    `${kind}: <b>${formatAmount(Number(tx.amount), tx.currency)}</b>${fx}`,
    `Дата: ${tx.occurredAt}`,
    `Категория: ${cat}`,
  ];
  if (tx.type === 'transfer') {
    const target = tx.toAccountName
      ? escapeHtml(tx.toAccountName) +
        (tx.toAmount ? ` (${formatAmount(Number(tx.toAmount), tx.toCurrency ?? 'RUB')})` : '')
      : 'вне счетов';
    lines.push(`Маршрут: ${escapeHtml(tx.accountName)} → ${target}`);
  } else {
    lines.push(`Счёт: ${escapeHtml(tx.accountName)}`);
  }
  if (tx.rate) lines.push(`Курс: ${tx.rate}`);
  if (tx.label) lines.push(`Метка: ${escapeHtml(tx.label)}`);
  if (tx.note) lines.push(`Заметка: ${escapeHtml(tx.note)}`);
  return lines.join('\n');
}

// Шапка списка операций: период, активные фильтры, счётчик страницы.
export function formatHistoryHeader(
  filters: HistoryFilters,
  total: number,
  page: number,
  pages: number,
): string {
  const parts: string[] = [];
  if (filters.from || filters.to) parts.push(`${filters.from ?? '…'} — ${filters.to ?? '…'}`);
  else parts.push('за всё время');
  if (filters.type) {
    parts.push(
      filters.type === 'expense' ? 'траты' : filters.type === 'income' ? 'доходы' : 'переводы',
    );
  }
  if (filters.categoryName) parts.push(escapeHtml(filters.categoryName));
  if (filters.accountName) parts.push(`счёт ${escapeHtml(filters.accountName)}`);
  if (filters.q) parts.push(`поиск «${escapeHtml(filters.q)}»`);

  const pageInfo = total > 0 ? ` · стр. ${page + 1}/${pages} · всего ${total}` : '';
  return `📋 <b>Операции</b> (${parts.join(', ')})${pageInfo}`;
}

interface TagReportData {
  tag: { name: string };
  total: number;
  byCategory: Array<{ categoryName: string; type: string; amount: string; count: number }>;
}

export function formatTagReport(data: TagReportData): string {
  const lines = [`🏷 <b>${escapeHtml(data.tag.name)}</b> — ${formatAmount(data.total)}`];
  if (!data.byCategory.length) {
    lines.push('', 'Операций с этим тегом нет.');
    return lines.join('\n');
  }
  lines.push('');
  for (const row of data.byCategory) {
    lines.push(
      `• ${escapeHtml(row.categoryName)} — <b>${formatAmount(Number(row.amount))}</b> (${row.count} шт.)`,
    );
  }
  return lines.join('\n');
}

interface AccountRow {
  name: string;
  currency: string;
  balance: number;
  isDefault: boolean;
  currentRate: number | null;
}

// Балансы счетов для /accounts: основной помечен, у вкладов — текущая ставка.
export function formatAccounts(accounts: AccountRow[]): string {
  if (!accounts.length) return 'Нет активных счетов.';
  const lines = accounts.map((a) => {
    const marker = a.isDefault ? '✅ ' : '• ';
    const rate = a.currentRate != null ? ` · ставка ${a.currentRate}%` : '';
    return `${marker}${escapeHtml(a.name)} — <b>${formatAmount(a.balance, a.currency)}</b>${rate}`;
  });
  return ['<b>Счета</b>', '', ...lines].join('\n');
}
