import { useEffect, useMemo, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import { $activeTree, $categoryIndex, rootsOfType } from '@/entities/category/model';
import { $tags } from '@/entities/tag/model';
import { api, ApiError } from '@/shared/api/client';
import { Field } from '@/shared/ui/Field';
import { notify } from '@/shared/ui/toast';
import { parseAmountInput } from '@/shared/lib/money';
import { todayIso } from '@/shared/lib/dates';
import {
  TX_TYPE_LABELS,
  type CreateTransactionInput,
  type LabelSuggestion,
  type TransactionRow,
  type TxType,
} from '@/shared/api/types';

interface Props {
  mode: 'create' | 'edit';
  initial?: TransactionRow;
  busy?: boolean;
  onSubmit: (input: CreateTransactionInput) => Promise<unknown>;
}

const TYPES: TxType[] = ['expense', 'transfer', 'income'];

// FR-A1…A6: сумма → категория → Enter; подкатегория/метка/дата — опциональны
export function TransactionForm({ mode, initial, busy, onSubmit }: Props) {
  const [activeTree, categoryIndex, tags] = useUnit([$activeTree, $categoryIndex, $tags]);

  const [type, setType] = useState<TxType>(initial?.type ?? 'expense');
  const [amountStr, setAmountStr] = useState(initial ? String(Number(initial.amount)) : '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategoryId ?? '');
  const [occurredAt, setOccurredAt] = useState(initial?.occurredAt ?? todayIso()); // FR-A2
  const [label, setLabel] = useState(initial?.label ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [tagIds, setTagIds] = useState<string[]>(initial?.tags.map((t) => t.id) ?? []);
  const [errors, setErrors] = useState<{ amount?: string; categoryId?: string }>({});
  const [suggestions, setSuggestions] = useState<LabelSuggestion[]>([]);

  const amountRef = useRef<HTMLInputElement>(null);
  const appliedLabel = useRef<string | null>(null);

  const roots = useMemo(() => {
    const active = rootsOfType(activeTree, type);
    // в режиме правки архивная категория операции остаётся выбираемой (BR-3)
    if (initial && !active.some((c) => c.id === initial.categoryId)) {
      const archived = categoryIndex.get(initial.categoryId);
      if (archived && archived.type === type) {
        return [...active, { ...archived, children: [] }];
      }
    }
    return active;
  }, [activeTree, type, initial, categoryIndex]);

  const selectedRoot = roots.find((c) => c.id === categoryId);
  const subcategories = selectedRoot?.children ?? [];

  // FR-A4 / BR-7 — автодополнение метки и предзаполнение категории
  useEffect(() => {
    const q = label.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<LabelSuggestion[]>('/transactions/labels', { q })
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [label]);

  useEffect(() => {
    const match = suggestions.find((s) => s.label.toLowerCase() === label.trim().toLowerCase());
    if (!match || appliedLabel.current === match.label) return;
    const category = categoryIndex.get(match.categoryId);
    if (!category) return;
    appliedLabel.current = match.label; // предложение, а не автоматизация: применяем один раз
    setType(category.type);
    setCategoryId(match.categoryId);
    setSubcategoryId(match.subcategoryId ?? '');
  }, [suggestions, label, categoryIndex]);

  const changeType = (next: TxType) => {
    setType(next);
    setCategoryId('');
    setSubcategoryId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // FR-A6 — валидация с формулировкой «что сделать»
    const amount = parseAmountInput(amountStr);
    const nextErrors: typeof errors = {};
    if (amount === null || amount <= 0) nextErrors.amount = 'Введите сумму больше нуля';
    if (!categoryId) nextErrors.categoryId = 'Выберите категорию';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const input: CreateTransactionInput = {
      amount: amount!,
      categoryId,
      subcategoryId: subcategoryId || null,
      occurredAt,
      label: label.trim() || null,
      note: note.trim() || null,
      tagIds,
    };

    try {
      await onSubmit(input);
      if (mode === 'create') {
        // FR-A1 — сумма очищается, фокус возвращается для следующего ввода
        setAmountStr('');
        setLabel('');
        setNote('');
        setTagIds([]);
        appliedLabel.current = null;
        amountRef.current?.focus();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length) {
          setErrors({
            amount: err.fieldErrors.amount,
            categoryId: err.fieldErrors.categoryId,
          });
        } else {
          notify(err.message, 'error');
        }
      } else {
        notify('Не удалось сохранить — попробуйте ещё раз', 'error');
      }
    }
  };

  const toggleTag = (id: string) =>
    setTagIds((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <Field label="Сумма, ₽" error={errors.amount}>
          <input
            ref={amountRef}
            className="amount-input"
            inputMode="decimal"
            placeholder="0"
            autoFocus={mode === 'create'} // NFR-U1 — клавиатура с первого касания
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </Field>
        <Field label="Тип">
          <select value={type} onChange={(e) => changeType(e.target.value as TxType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TX_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="form-row">
        <Field label="Категория" error={errors.categoryId}>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setSubcategoryId('');
            }}
          >
            <option value="">— выберите —</option>
            {roots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {subcategories.length > 0 && (
          <Field label="Подкатегория" hint="необязательно">
            <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
              <option value="">—</option>
              {subcategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {selectedRoot?.description && (
        // BR-8 / FR-C7 — определение категории как подсказка при вводе
        <p className="small muted">{selectedRoot.description}</p>
      )}

      <div className="form-row">
        <Field label="Дата">
          <input
            type="date"
            value={occurredAt}
            max={todayIso()}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </Field>
        <Field label="Метка" hint="магазин или сервис — для подсказок">
          <input
            list="label-suggestions"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Перекрёсток"
          />
          <datalist id="label-suggestions">
            {suggestions.map((s) => (
              <option key={s.label} value={s.label} />
            ))}
          </datalist>
        </Field>
        <Field label="Заметка" hint="необязательно">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {tags.length > 0 && (
        <Field label="Теги" hint="событие или проект поверх категорий">
          <div className="chips">
            {tags.map((tag) => (
              <button
                type="button"
                key={tag.id}
                className={`chip${tagIds.includes(tag.id) ? ' chip--on' : ''}`}
                onClick={() => toggleTag(tag.id)}
                aria-pressed={tagIds.includes(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      <button className="btn btn--primary btn--lg" type="submit" disabled={busy}>
        {mode === 'create' ? 'Добавить' : 'Сохранить'}
      </button>
    </form>
  );
}
