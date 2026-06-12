import { useEffect, useState } from 'react';
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
import { ConfirmDialog } from '@/shared/ui/Modal';
import { formatMoney, parseAmountInput } from '@/shared/lib/money';
import { todayIso } from '@/shared/lib/dates';
import type { Account, AccountRate } from '@/shared/api/types';

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('ru-RU');
}

// Счета: балансы в валюте счёта, начальный остаток, основной счёт, архив
export function AccountsPage() {
  const accounts = useUnit($accounts);
  const active = accounts.filter((a) => a.active);
  const archived = accounts.filter((a) => !a.active);

  return (
    <>
      <h1>Счета</h1>
      <p className="section-note">
        Расходы списываются со счёта (по умолчанию — основной), доходы зачисляются, переводы
        перемещают между счетами. Баланс — в валюте счёта.
      </p>
      <div className="card">
        {active.map((account) => (
          <AccountRow key={account.id} account={account} />
        ))}
      </div>
      <CreateAccountForm />
      {archived.length > 0 && (
        <>
          <h2>Архив</h2>
          <div className="card">
            {archived.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function AccountRow({ account }: { account: Account }) {
  const busy = useUnit(updateAccountFx.pending);
  const [name, setName] = useState(account.name);
  const [initial, setInitial] = useState(String(Number(account.initialBalance)));
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [showRates, setShowRates] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const initialBalance = parseAmountInput(initial) ?? 0;
    if (!name.trim()) {
      setError('Введите название');
      return;
    }
    setError('');
    await updateAccountFx({ id: account.id, name: name.trim(), initialBalance }).catch(
      () => undefined,
    );
  };

  const makeDefault = () =>
    updateAccountFx({ id: account.id, isDefault: true }).catch(() => undefined);

  const toggleArchive = () =>
    updateAccountFx({ id: account.id, active: !account.active }).catch(() => undefined);

  return (
    <form className="legend-row" style={{ alignItems: 'flex-start', gap: 12 }} onSubmit={save}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="legend-row" style={{ padding: 0 }}>
          <span className="legend-row__name">
            {account.name}
            <span className="small" style={{ marginLeft: 8 }}>
              {account.currency}
            </span>
            {account.isDefault && (
              <span className="badge" style={{ marginLeft: 8 }}>
                основной
              </span>
            )}
          </span>
          <span className="legend-row__val">
            {formatMoney(account.balance, account.currency)}
          </span>
        </div>
        <div className="small muted">
          {account.currentRate !== null
            ? `${account.currentRate}% годовых${
                account.currentRateFrom ? ` с ${formatDate(account.currentRateFrom)}` : ''
              }`
            : 'без процентов'}
        </div>
        {error && (
          <span className="field__error" role="alert">
            {error}
          </span>
        )}
      </div>
      <Field label="Название">
        <input value={name} style={{ width: 150 }} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={`Начальный остаток, ${account.currency}`}>
        <input
          inputMode="decimal"
          value={initial}
          style={{ width: 140 }}
          onChange={(e) => setInitial(e.target.value)}
        />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 21 }}>
        <button type="submit" className="btn" disabled={busy}>
          Сохранить
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setShowRates((v) => !v)}
        >
          {showRates ? 'Скрыть ставки' : 'Ставка %'}
        </button>
        {!account.isDefault && account.active && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={makeDefault}>
            Сделать основным
          </button>
        )}
        {!account.isDefault && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={toggleArchive}>
            {account.active ? 'В архив' : 'Вернуть'}
          </button>
        )}
        {!account.isDefault && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Удалить
          </button>
        )}
      </div>
      {showRates && <RateSection account={account} />}
      {confirming && (
        <ConfirmDialog
          title="Удалить счёт?"
          text={`Счёт «${account.name}» будет удалён. Удаление возможно, только если по счёту нет операций.`}
          confirmLabel="Удалить"
          danger
          onConfirm={() => deleteAccountFx(account.id)}
          onClose={() => setConfirming(false)}
        />
      )}
    </form>
  );
}

// История ставок: список периодов + форма добавления новой ставки с датой вступления
function RateSection({ account }: { account: Account }) {
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

  return (
    <div style={{ flexBasis: '100%', marginTop: 8, paddingLeft: 12 }}>
      <div className="small muted" style={{ marginBottom: 6 }}>
        Ставка задаётся в % годовых; начисляется автоматически каждый день по ставке, действующей
        в этот день.
      </div>
      {rates.length > 0 && (
        <ul className="small" style={{ margin: '0 0 8px', paddingLeft: 16 }}>
          {rates.map((r) => (
            <li key={r.id}>
              {Number(r.rate)}% с {formatDate(r.effectiveFrom)}
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                style={{ marginLeft: 8 }}
                aria-label="Удалить ставку"
                onClick={() => remove(r.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="legend-row" style={{ alignItems: 'flex-end', gap: 12, padding: 0 }}>
        <Field label="Новая ставка, % годовых">
          <input
            inputMode="decimal"
            value={rate}
            placeholder="16"
            style={{ width: 120 }}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="Действует с">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <button type="button" className="btn" disabled={busy} onClick={add}>
          Добавить ставку
        </button>
      </div>
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
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
      <form
        className="legend-row"
        style={{ alignItems: 'flex-end', gap: 12, padding: 0 }}
        onSubmit={submit}
      >
        <Field label="Новый счёт">
          <input
            value={name}
            placeholder="Например, Наличные"
            style={{ width: 180 }}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Валюта">
          <input
            value={currency}
            maxLength={3}
            style={{ width: 70, textTransform: 'uppercase' }}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </Field>
        <Field label="Начальный остаток">
          <input
            inputMode="decimal"
            value={initial}
            placeholder="0"
            style={{ width: 140 }}
            onChange={(e) => setInitial(e.target.value)}
          />
        </Field>
        <button type="submit" className="btn" disabled={busy}>
          Создать
        </button>
      </form>
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
