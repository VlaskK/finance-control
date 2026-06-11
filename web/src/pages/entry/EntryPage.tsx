import { useEffect } from 'react';
import { useUnit } from 'effector-react';
import { TransactionForm } from '@/features/transaction-form/TransactionForm';
import { TransactionList } from '@/widgets/transaction-list/TransactionList';
import { createTransactionFx } from '@/entities/transaction/model';
import { $recent, entryOpened } from './model';
import { formatMoney } from '@/shared/lib/money';
import { todayIso } from '@/shared/lib/dates';

// Главный сценарий дня (§4): сумма → категория → «Добавить»
export function EntryPage() {
  const [recent, busy] = useUnit([$recent, createTransactionFx.pending]);

  useEffect(() => {
    entryOpened();
  }, []);

  const today = todayIso();
  const todayTotal = recent
    .filter((r) => r.occurredAt === today && r.type === 'expense')
    .reduce((acc, r) => acc + Number(r.amount), 0);

  return (
    <>
      <h1>Ввод операции</h1>
      <div className="card">
        <TransactionForm
          mode="create"
          busy={busy}
          onSubmit={(input) => createTransactionFx(input)}
        />
      </div>
      <div className="card">
        <h2>
          Последние операции
          <span className="badge">за сегодня: {formatMoney(todayTotal)}</span>
        </h2>
        <TransactionList rows={recent.slice(0, 12)} />
      </div>
    </>
  );
}
