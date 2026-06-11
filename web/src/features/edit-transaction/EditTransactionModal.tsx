import { useUnit } from 'effector-react';
import { Modal } from '@/shared/ui/Modal';
import { TransactionForm } from '@/features/transaction-form/TransactionForm';
import { updateTransactionFx } from '@/entities/transaction/model';
import type { TransactionRow } from '@/shared/api/types';

// FR-B2 — редактирование любого поля операции
export function EditTransactionModal({
  row,
  onClose,
}: {
  row: TransactionRow;
  onClose: () => void;
}) {
  const busy = useUnit(updateTransactionFx.pending);
  return (
    <Modal title="Операция" onClose={onClose} width={560}>
      <TransactionForm
        mode="edit"
        initial={row}
        busy={busy}
        onSubmit={async (input) => {
          await updateTransactionFx({ id: row.id, input });
          onClose();
        }}
      />
    </Modal>
  );
}
