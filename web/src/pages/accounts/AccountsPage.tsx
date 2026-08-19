import { useEffect, useMemo, useState } from 'react';
import { useUnit } from 'effector-react';
import {
  $accounts,
  addRateFx,
  createAccountFx,
  deleteAccountFx,
  deleteRateFx,
  loadRatesFx,
  updateAccountFx,
} from '@/entities/account/model';
import { Field } from '@/shared/ui/Field';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { formatMoney, parseAmountInput } from '@/shared/lib/money';
import { todayIso } from '@/shared/lib/dates';
import type { Account, AccountRate } from '@/shared/api/types';

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('ru-RU');
}

function initials(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}

// Счета: балансы в валюте счёта, начальный остаток, основной счёт, ставки, архив
export function AccountsPage() {
  const accounts = useUnit($accounts);
  const [editing, setEditing] = useState<Account | null>(null);
  const [rates, setRates] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = accounts.filter((a) => a.active);
  const archived = accounts.filter((a) => !a.active);

  // Итог по каждой валюте: складывать разные валюты нельзя, поэтому отдельная плитка на каждую
  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const a of active) {
      byCurrency.set(a.currency, (byCurrency.get(a.currency) ?? 0) + a.balance);
    }
    return [...byCurrency.entries()];
  }, [active]);

  const rowProps = {
    onEdit: setEditing,
    onRates: setRates,
    onDelete: setDeleting,
  };

  return (
    <>
      <h1>Счета</h1>
      <p className="section-note">
        Расходы списываются со счёта (по умолчанию — основной), доходы зачисляются, переводы
        перемещают между счетами. Баланс — в валюте счёта.
      </p>

      {totals.length > 0 && (
        <div className="acc-totals">
          {totals.map(([currency, sum]) => (
            <div className="card acc-total" key={currency}>
              <div className="acc-total__label">Итого, {currency}</div>
              <div className="stat">{formatMoney(sum, currency)}</div>
              <div className="acc-total__count small muted">
                {active.filter((a) => a.currency === currency).length} сч.
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {active.length === 0 ? (
          <div className="empty">Пока нет активных счетов — создайте первый ниже.</div>
        ) : (
          active.map((account) => (
            <AccountRow key={account.id} account={account} {...rowProps} />
          ))
        )}
      </div>

      <CreateAccountForm />

      {archived.length > 0 && (
        <>
          <button
            type="button"
            className="btn btn--ghost acc-archive-toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? '▾' : '▸'} Архив ({archived.length})
          </button>
          {showArchived && (
            <div className="card">
              {archived.map((account) => (
                <AccountRow key={account.id} account={account} {...rowProps} />
              ))}
            </div>
          )}
        </>
      )}

      {editing && <EditAccountModal account={editing} onClose={() => setEditing(null)} />}
      {rates && <RatesModal account={rates} onClose={() => setRates(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Удалить счёт?"
          text={`Счёт «${deleting.name}» будет удалён. Удаление возможно, только если по счёту нет операций — иначе отправьте счёт в архив.`}
          confirmLabel="Удалить"
          danger
          onConfirm={() => deleteAccountFx(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function AccountRow({
  account,
  onEdit,
  onRates,
  onDelete,
}: {
  account: Account;
  onEdit: (a: Account) => void;
  onRates: (a: Account) => void;
  onDelete: (a: Account) => void;
}) {
  const busy = useUnit(updateAccountFx.pending);

  const makeDefault = () =>
    updateAccountFx({ id: account.id, isDefault: true }).catch(() => undefined);

  const toggleArchive = () =>
    updateAccountFx({ id: account.id, active: !account.active }).catch(() => undefined);

  const rateText =
    account.currentRate !== null
      ? `${account.currentRate}% годовых${
          account.currentRateFrom ? ` с ${formatDate(account.currentRateFrom)}` : ''
        }`
      : 'без процентов';

  return (
    <div className={`acc-row${account.active ? '' : ' acc-row--archived'}`}>
      <span
        className={`acc-avatar${account.isDefault ? ' acc-avatar--default' : ''}`}
        aria-hidden
      >
        {initials(account.name)}
      </span>

      <div className="acc-row__main">
        <div className="acc-row__title">
          <span className="acc-row__name">{account.name}</span>
          <span className="badge">{account.currency}</span>
          {account.isDefault && <span className="badge badge--info">основной</span>}
          {!account.active && <span className="badge">архив</span>}
        </div>
        <div className="acc-row__meta">
          {rateText} · начальный остаток{' '}
          {formatMoney(account.initialBalance, account.currency)}
        </div>
      </div>

      <div className="acc-row__amount">
        <span className={account.balance < 0 ? 'acc-row__sum acc-row__sum--neg' : 'acc-row__sum'}>
          {formatMoney(account.balance, account.currency)}
        </span>
      </div>

      <div className="acc-row__actions">
        <button
          type="button"
          className="icon-btn"
          title="Изменить название и начальный остаток"
          aria-label="Изменить счёт"
          onClick={() => onEdit(account)}
        >
          ✎
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Проценты по счёту"
          aria-label="Проценты по счёту"
          onClick={() => onRates(account)}
        >
          %
        </button>
        {!account.isDefault && account.active && (
          <button
            type="button"
            className="icon-btn"
            title="Сделать основным"
            aria-label="Сделать основным"
            disabled={busy}
            onClick={makeDefault}
          >
            ★
          </button>
        )}
        {!account.isDefault && (
          <button
            type="button"
            className="icon-btn"
            title={account.active ? 'В архив' : 'Вернуть из архива'}
            aria-label={account.active ? 'В архив' : 'Вернуть из архива'}
            disabled={busy}
            onClick={toggleArchive}
          >
            {account.active ? '⬇' : '⬆'}
          </button>
        )}
        {!account.isDefault && (
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            title="Удалить"
            aria-label="Удалить счёт"
            disabled={busy}
            onClick={() => onDelete(account)}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function EditAccountModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const busy = useUnit(updateAccountFx.pending);
  const [name, setName] = useState(account.name);
  const [initial, setInitial] = useState(String(Number(account.initialBalance)));
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Введите название');
      return;
    }
    setError('');
    await updateAccountFx({
      id: account.id,
      name: name.trim(),
      initialBalance: parseAmountInput(initial) ?? 0,
    }).then(onClose, () => undefined);
  };

  return (
    <Modal title="Счёт" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Название" error={error}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label={`Начальный остаток, ${account.currency}`}
          hint="остаток на счёте до первой операции в FinFlow"
        >
          <input
            inputMode="decimal"
            value={initial}
            onChange={(e) => setInitial(e.target.value)}
          />
        </Field>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

// История ставок: список периодов + форма добавления новой ставки с датой вступления
function RatesModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const busy = useUnit(addRateFx.pending);
  const [rates, setRates] = useState<AccountRate[]>([]);
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(todayIso());
  const [error, setError] = useState('');

  const reload = () => loadRatesFx(account.id).then(setRates).catch(() => undefined);
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseAmountInput(rate);
    if (value === null || value < 0) {
      setError('Введите ставку (например, 16)');
      return;
    }
    setError('');
    try {
      await addRateFx({ id: account.id, rate: value, effectiveFrom: from });
      setRate('');
      reload();
    } catch {
      /* тост покажет модель */
    }
  };

  const remove = async (rateId: string) => {
    await deleteRateFx({ id: account.id, rateId }).catch(() => undefined);
    reload();
  };

  const sorted = [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return (
    <Modal title={`Проценты — ${account.name}`} onClose={onClose}>
      <p className="confirm-text">
        Ставка задаётся в % годовых и начисляется автоматически каждый день по ставке,
        действующей в этот день.
      </p>

      {sorted.length > 0 ? (
        <ul className="rate-list">
          {sorted.map((r) => (
            <li className="rate-list__item" key={r.id}>
              <span className="rate-list__value">{Number(r.rate)}% годовых</span>
              <span className="rate-list__from small muted">с {formatDate(r.effectiveFrom)}</span>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                title="Удалить ставку"
                aria-label={`Удалить ставку ${Number(r.rate)}% с ${formatDate(r.effectiveFrom)}`}
                onClick={() => remove(r.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty small">Ставок нет — проценты не начисляются.</div>
      )}

      <form onSubmit={add}>
        <div className="form-row">
          <Field label="Новая ставка, % годовых" error={error}>
            <input
              inputMode="decimal"
              value={rate}
              placeholder="16"
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field label="Действует с">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            Добавить ставку
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateAccountForm() {
  const busy = useUnit(createAccountFx.pending);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('RUB');
  const [initial, setInitial] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Введите название счёта');
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) {
      setError('Код валюты — 3 латинские буквы, например USD');
      return;
    }
    setError('');
    await createAccountFx({
      name: name.trim(),
      currency: currency.trim().toUpperCase(),
      initialBalance: parseAmountInput(initial) ?? 0,
    })
      .then(() => {
        setName('');
        setCurrency('RUB');
        setInitial('');
      })
      .catch(() => undefined);
  };

  return (
    <div className="card">
      <h2>Новый счёт</h2>
      <form onSubmit={submit}>
        <div className="form-row">
          <Field label="Название" error={error}>
            <input
              value={name}
              placeholder="Например, Наличные"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Валюта">
            <input
              value={currency}
              maxLength={3}
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </Field>
          <Field label="Начальный остаток" hint="сколько на счёте сейчас, до операций">
            <input
              inputMode="decimal"
              value={initial}
              placeholder="0"
              onChange={(e) => setInitial(e.target.value)}
            />
          </Field>
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Создать счёт
        </button>
      </form>
    </div>
  );
}
