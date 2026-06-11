import { useMemo, useState } from 'react';
import { groupByDate } from '@/entities/transaction/lib';
import { deleteTransactionFx } from '@/entities/transaction/model';
import { EditTransactionModal } from '@/features/edit-transaction/EditTransactionModal';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { formatDayHeading } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/money';
import type { TransactionRow } from '@/shared/api/types';

interface Props {
  rows: TransactionRow[];
  emptyText?: string;
}

// FR-B1 — операции по дням, новые сверху; FR-B2/B3 — правка и удаление
export function TransactionList({
  rows,
  emptyText = 'Операций пока нет — добавьте первую на экране «Ввод»',
}: Props) {
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [deleting, setDeleting] = useState<TransactionRow | null>(null);
  const groups = useMemo(() => groupByDate(rows), [rows]);

  if (!rows.length) return <div className="empty">{emptyText}</div>;

  return (
    <div>
      {groups.map((group) => (
        <div className="day-group" key={group.date}>
          <div className="day-group__head">
            <span>{formatDayHeading(group.date)}</span>
            {group.expenseTotal > 0 && <span>{formatMoney(group.expenseTotal)}</span>}
          </div>
          {group.rows.map((row) => (
            <TxRow key={row.id} row={row} onEdit={setEditing} onDelete={setDeleting} />
          ))}
        </div>
      ))}

      {editing && <EditTransactionModal row={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        // FR-B3 — удаление только после подтверждения
        <ConfirmDialog
          title="Удалить операцию?"
          text={`${deleting.categoryName}, ${formatMoney(deleting.amount)} за ${formatDayHeading(
            deleting.occurredAt,
          ).toLowerCase()}. Действие необратимо.`}
          confirmLabel="Удалить"
          danger
          onConfirm={() => deleteTransactionFx(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function TxRow({
  row,
  onEdit,
  onDelete,
}: {
  row: TransactionRow;
  onEdit: (row: TransactionRow) => void;
  onDelete: (row: TransactionRow) => void;
}) {
  const amountClass =
    row.type === 'income'
      ? 'tx-row__amount tx-row__amount--income'
      : row.type === 'transfer'
        ? 'tx-row__amount tx-row__amount--transfer'
        : 'tx-row__amount';
  const sign = row.type === 'income' ? '+' : row.type === 'transfer' ? '→ ' : '−';

  return (
    <div className="tx-row">
      <span className="dot" style={{ background: row.categoryColor }} aria-hidden />
      <div className="tx-row__main">
        <div className="tx-row__title">
          <span>
            {row.categoryName}
            {row.subcategoryName && <span className="muted"> · {row.subcategoryName}</span>}
          </span>
          {row.tags.map((tag) => (
            <span key={tag.id} className="badge badge--info">
              {tag.name}
            </span>
          ))}
        </div>
        {(row.label || row.note) && (
          <div className="tx-row__sub">{[row.label, row.note].filter(Boolean).join(' — ')}</div>
        )}
      </div>
      <span className={amountClass}>
        {sign}
        {formatMoney(row.amount)}
      </span>
      <div className="tx-row__actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onEdit(row)}
          aria-label="Изменить"
          title="Изменить"
        >
          ✎
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          onClick={() => onDelete(row)}
          aria-label="Удалить"
          title="Удалить"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
