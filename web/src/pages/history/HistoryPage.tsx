import { useEffect } from 'react';
import { useUnit } from 'effector-react';
import { TransactionList } from '@/widgets/transaction-list/TransactionList';
import {
  $filters,
  $transactions,
  filtersChanged,
  filtersReset,
  transactionsInvalidated,
} from '@/entities/transaction/model';
import { $categoryTree } from '@/entities/category/model';
import { $accounts } from '@/entities/account/model';
import { $tags } from '@/entities/tag/model';
import { Field } from '@/shared/ui/Field';
import { formatMoney } from '@/shared/lib/money';
import { TX_TYPE_LABELS, type TxType } from '@/shared/api/types';

// FR-B1 — история; FR-B4 — фильтры; FR-B5 — поиск по метке
export function HistoryPage() {
  const [filters, rows, tree, accounts, tags] = useUnit([
    $filters,
    $transactions,
    $categoryTree,
    $accounts,
    $tags,
  ]);

  useEffect(() => {
    transactionsInvalidated();
  }, []);

  // потребление — в рублях по эквиваленту (валютные траты не искажают сумму)
  const expenseTotal = rows
    .filter((r) => r.type === 'expense')
    .reduce((acc, r) => acc + Number(r.baseAmount), 0);

  return (
    <>
      <h1>История</h1>
      <div className="card">
        <div className="filters-bar">
          <Field label="Тип">
            <select
              value={filters.type ?? ''}
              onChange={(e) =>
                filtersChanged({ type: (e.target.value || undefined) as TxType | undefined })
              }
            >
              <option value="">Все</option>
              {(Object.keys(TX_TYPE_LABELS) as TxType[]).map((t) => (
                <option key={t} value={t}>
                  {TX_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Категория">
            <select
              value={filters.categoryId ?? ''}
              onChange={(e) => filtersChanged({ categoryId: e.target.value || undefined })}
            >
              <option value="">Все</option>
              {tree.map((root) => (
                <optgroup key={root.id} label={root.name}>
                  <option value={root.id}>{root.name}</option>
                  {root.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      — {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          {accounts.length > 1 && (
            <Field label="Счёт">
              <select
                value={filters.accountId ?? ''}
                onChange={(e) => filtersChanged({ accountId: e.target.value || undefined })}
              >
                <option value="">Все</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="С даты">
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => filtersChanged({ from: e.target.value || undefined })}
            />
          </Field>
          <Field label="По дату">
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => filtersChanged({ to: e.target.value || undefined })}
            />
          </Field>
          {tags.length > 0 && (
            <Field label="Тег">
              <select
                value={filters.tagId ?? ''}
                onChange={(e) => filtersChanged({ tagId: e.target.value || undefined })}
              >
                <option value="">Все</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Поиск по метке">
            <input
              value={filters.q ?? ''}
              placeholder="Перекрёсток"
              onChange={(e) => filtersChanged({ q: e.target.value || undefined })}
            />
          </Field>
          <button type="button" className="btn" onClick={() => filtersReset()}>
            Сбросить
          </button>
        </div>

        <p className="small muted">
          Найдено операций: {rows.length}, потребление: {formatMoney(expenseTotal)}
        </p>

        <TransactionList
          rows={rows}
          emptyText="Ничего не найдено — измените фильтры или сбросьте их"
        />
      </div>
    </>
  );
}
