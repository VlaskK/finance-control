import { useEffect, useState } from 'react';
import { createEffect, createStore, sample } from 'effector';
import { useUnit } from 'effector-react';
import { api } from '@/shared/api/client';
import { $activeTree } from '@/entities/category/model';
import { $budgets, budgetsInvalidated, upsertBudgetFx } from '@/entities/budget/model';
import { Field } from '@/shared/ui/Field';
import { formatMoney, parseAmountInput } from '@/shared/lib/money';
import { currentMonthIso, formatMonth } from '@/shared/lib/dates';
import type { BudgetStatusResponse, CategoryNode } from '@/shared/api/types';

// FR-F2 — факт текущего месяца против лимита (CALC-2)
const loadStatusFx = createEffect(() =>
  api.get<BudgetStatusResponse>('/analytics/budget-status', { month: currentMonthIso() }),
);

const $status = createStore<BudgetStatusResponse | null>(null).on(
  loadStatusFx.doneData,
  (_, data) => data,
);

sample({ clock: upsertBudgetFx.done, target: loadStatusFx });

// FR-F1 — месячные лимиты по категориям
export function BudgetsPage() {
  const [tree, budgets, status] = useUnit([$activeTree, $budgets, $status]);

  useEffect(() => {
    budgetsInvalidated();
    loadStatusFx();
  }, []);

  const expenseRoots = tree.filter((c) => c.type === 'expense');
  const factByCategory = new Map(status?.items.map((i) => [i.categoryId, i]) ?? []);
  const limitByCategory = new Map(budgets.map((b) => [b.categoryId, Number(b.monthlyLimit)]));

  return (
    <>
      <h1>Бюджеты</h1>
      <p className="section-note">
        Месячный лимит по категории. Факт — {formatMonth(currentMonthIso()).toLowerCase()},
        учитываются только расходы.
      </p>
      <div className="card">
        {expenseRoots.map((category) => (
          <BudgetRow
            key={category.id}
            category={category}
            limit={limitByCategory.get(category.id) ?? null}
            fact={factByCategory.get(category.id)?.fact ?? null}
          />
        ))}
      </div>
    </>
  );
}

function BudgetRow({
  category,
  limit,
  fact,
}: {
  category: CategoryNode;
  limit: number | null;
  fact: number | null;
}) {
  const busy = useUnit(upsertBudgetFx.pending);
  const [value, setValue] = useState(limit !== null ? String(limit) : '');
  const [error, setError] = useState('');

  useEffect(() => {
    setValue(limit !== null ? String(limit) : '');
  }, [limit]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      await upsertBudgetFx({ categoryId: category.id, monthlyLimit: null });
      return;
    }
    const amount = parseAmountInput(value);
    if (amount === null || amount <= 0) {
      setError('Введите лимит больше нуля или оставьте поле пустым');
      return;
    }
    setError('');
    await upsertBudgetFx({ categoryId: category.id, monthlyLimit: amount }).catch(() => undefined);
  };

  const overspent = limit !== null && fact !== null && fact > limit;
  const ratio = limit !== null && limit > 0 && fact !== null ? Math.min(fact / limit, 1) : 0;

  return (
    <form className="legend-row" style={{ alignItems: 'flex-start', gap: 12 }} onSubmit={save}>
      <span className="dot" style={{ background: category.color, marginTop: 12 }} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="legend-row" style={{ padding: 0 }}>
          <span className="legend-row__name">{category.name}</span>
          {limit !== null && fact !== null && (
            <span className="legend-row__val small">
              {formatMoney(fact)} из {formatMoney(limit)}
              {overspent && (
                <span className="badge badge--danger" style={{ marginLeft: 8 }}>
                  перерасход {formatMoney(fact - limit)}
                </span>
              )}
            </span>
          )}
        </div>
        {limit !== null && (
          <div className="progress">
            <div
              className={`progress__bar${overspent ? ' progress__bar--over' : ''}`}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        )}
        {error && (
          <span className="field__error" role="alert">
            {error}
          </span>
        )}
      </div>
      <Field label="Лимит, ₽/мес">
        <input
          inputMode="decimal"
          value={value}
          placeholder="без лимита"
          style={{ width: 140 }}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <button type="submit" className="btn" disabled={busy} style={{ marginTop: 21 }}>
        Сохранить
      </button>
    </form>
  );
}
