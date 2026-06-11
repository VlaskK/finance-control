import { useEffect, useMemo, useState } from 'react';
import { useUnit } from 'effector-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  $dynamics,
  $from,
  $granularity,
  $inflation,
  $to,
  dynamicsOpened,
  fromChanged,
  granularityChanged,
  toChanged,
} from './model';
import {
  $recurring,
  createRecurringFx,
  deleteRecurringFx,
  updateRecurringFx,
} from '@/entities/recurring/model';
import { $activeTree } from '@/entities/category/model';
import { Field } from '@/shared/ui/Field';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { formatMoney } from '@/shared/lib/money';
import type { DynamicsCategory, RecurringItem } from '@/shared/api/types';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function periodLabel(period: string): string {
  if (period.length === 4) return period; // год
  return `${MONTHS_SHORT[Number(period.slice(5, 7)) - 1]} ${period.slice(2, 4)}`;
}

function signMoney(n: number): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n)}`;
}

// FR-E1…E4 — аналитическое ядро. Каждая метрика честно маркируется:
// динамика трат ≠ инфляция, средний чек — прокси, Ласпейрес — настоящая личная инфляция.
export function DynamicsPage() {
  const [from, to, granularity, dynamics, inflation] = useUnit([
    $from,
    $to,
    $granularity,
    $dynamics,
    $inflation,
  ]);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [focusCategoryId, setFocusCategoryId] = useState('');

  useEffect(() => {
    dynamicsOpened();
  }, []);

  const categories = dynamics?.categories ?? [];

  // по умолчанию — топ-5 категорий по тратам за диапазон
  const visibleIds = selectedIds ?? categories.slice(0, 5).map((c) => c.categoryId);
  const visible = categories.filter((c) => visibleIds.includes(c.categoryId));

  const focusCategory =
    categories.find((c) => c.categoryId === focusCategoryId) ?? categories[0] ?? null;

  const spendData = useMemo(() => {
    if (!dynamics) return [];
    return dynamics.periods.map((period, i) => {
      const row: Record<string, string | number | null> = { period: periodLabel(period) };
      for (const cat of visible) row[cat.name] = cat.points[i]?.spend ?? 0;
      return row;
    });
  }, [dynamics, visible]);

  const toggleCategory = (id: string) =>
    setSelectedIds((cur) => {
      const base = cur ?? visibleIds;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  return (
    <>
      <h1>Динамика и инфляция</h1>

      <div className="period-bar">
        <Field label="С месяца">
          <input type="month" value={from} onChange={(e) => fromChanged(e.target.value)} />
        </Field>
        <Field label="По месяц">
          <input type="month" value={to} onChange={(e) => toChanged(e.target.value)} />
        </Field>
        <div className="segmented" role="group" aria-label="Гранулярность">
          <button
            type="button"
            aria-pressed={granularity === 'month'}
            onClick={() => granularityChanged('month')}
          >
            Месяцы
          </button>
          <button
            type="button"
            aria-pressed={granularity === 'year'}
            onClick={() => granularityChanged('year')}
          >
            Годы
          </button>
        </div>
      </div>

      {/* FR-E1 / CALC-3 — динамика трат (НЕ инфляция) */}
      <div className="card">
        <h2>
          Динамика трат по категориям
          <span className="badge badge--warn">это динамика трат, не инфляция</span>
        </h2>
        {categories.length === 0 ? (
          <div className="empty">Нет расходов за выбранный диапазон</div>
        ) : (
          <>
            <div className="chips" style={{ marginBottom: 12 }}>
              {categories.map((cat) => (
                <button
                  key={cat.categoryId}
                  type="button"
                  className={`chip${visibleIds.includes(cat.categoryId) ? ' chip--on' : ''}`}
                  aria-pressed={visibleIds.includes(cat.categoryId)}
                  onClick={() => toggleCategory(cat.categoryId)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={spendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tickLine={false} fontSize={12} />
                <YAxis tickLine={false} fontSize={12} width={70} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                {visible.map((cat) => (
                  <Line
                    key={cat.categoryId}
                    type="monotone"
                    dataKey={cat.name}
                    stroke={cat.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <ChangeTable categories={visible} periods={dynamics?.periods ?? []} />
          </>
        )}
      </div>

      <div className="grid-2">
        {/* FR-E2 / CALC-4 — средний чек, прокси инфляции */}
        <div className="card">
          <h2>
            Средний чек
            <span className="badge badge--warn">прокси инфляции</span>
          </h2>
          {!focusCategory ? (
            <div className="empty">Нет данных</div>
          ) : (
            <>
              <Field label="Категория">
                <select
                  value={focusCategory.categoryId}
                  onChange={(e) => setFocusCategoryId(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.categoryId} value={c.categoryId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={focusCategory.points.map((p) => ({
                    period: periodLabel(p.period),
                    'Средний чек': p.avgTicket,
                    'Сглаженный (3 периода)': p.avgTicketSmoothed,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tickLine={false} fontSize={12} />
                  <YAxis tickLine={false} fontSize={12} width={70} />
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  <Line
                    type="monotone"
                    dataKey="Средний чек"
                    stroke="#b3bdd1"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Сглаженный (3 периода)"
                    stroke={focusCategory.color}
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="small muted">
                Средний чек растёт и когда дорожают цены, и когда вы просто берёте больше за раз —
                поэтому это прокси, а не чистая инфляция.
              </p>
            </>
          )}
        </div>

        {/* FR-E3 / CALC-5 — разложение «частота × чек» */}
        <div className="card">
          <h2>Почему изменились траты</h2>
          {focusCategory ? (
            <DecompositionBlock category={focusCategory} />
          ) : (
            <div className="empty">Нет данных</div>
          )}
        </div>
      </div>

      {/* FR-E4 / CALC-6 — настоящая личная инфляция */}
      <div className="card">
        <h2>
          Личная инфляция
          <span className="badge badge--info">индекс Ласпейреса по фикс-позициям</span>
        </h2>
        {!inflation || !inflation.available ? (
          <div className="empty">
            <p>Индекс пока не считается — нет регулярных позиций с фиксированной ценой.</p>
            <p className="small">
              Добавьте ниже позиции вроде аренды, подписок или спортзала и включите им
              «фиксированную цену». Операции связываются с позицией автоматически по метке с тем же
              названием — индекс начнёт считаться со второго месяца данных.
            </p>
          </div>
        ) : (
          <InflationBlock inflation={inflation} />
        )}
      </div>

      <RecurringSection />
    </>
  );
}

// Таблица % изменения к базовому периоду (CALC-3)
function ChangeTable({
  categories,
  periods,
}: {
  categories: DynamicsCategory[];
  periods: string[];
}) {
  if (!periods.length) return null;
  const base = periods[0];
  const last = periods[periods.length - 1];
  return (
    <table style={{ marginTop: 12 }}>
      <thead>
        <tr>
          <th>Категория</th>
          <th className="num">{periodLabel(base)} (база)</th>
          <th className="num">{periodLabel(last)}</th>
          <th className="num">Изменение к базе</th>
        </tr>
      </thead>
      <tbody>
        {categories.map((cat) => {
          const first = cat.points[0];
          const lastPoint = cat.points[cat.points.length - 1];
          return (
            <tr key={cat.categoryId}>
              <td>
                <span className="dot" style={{ background: cat.color, marginRight: 6 }} aria-hidden />
                {cat.name}
              </td>
              <td className="num">{formatMoney(first?.spend ?? 0)}</td>
              <td className="num">{formatMoney(lastPoint?.spend ?? 0)}</td>
              <td
                className={`num ${
                  (lastPoint?.changePct ?? 0) > 0
                    ? 'delta-up'
                    : (lastPoint?.changePct ?? 0) < 0
                      ? 'delta-down'
                      : ''
                }`}
              >
                {lastPoint?.changePct === null || lastPoint?.changePct === undefined
                  ? '—'
                  : `${lastPoint.changePct > 0 ? '+' : ''}${lastPoint.changePct}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// CALC-5: ΔE ≈ Δn·чек₀ + n₀·Δчек (+ взаимный эффект)
function DecompositionBlock({ category }: { category: DynamicsCategory }) {
  const lastWithData = [...category.points].reverse().find((p) => p.decomposition);
  if (!lastWithData?.decomposition) {
    return (
      <div className="empty">
        Для разложения нужны траты и в базовом, и в текущем периоде диапазона
      </div>
    );
  }
  const d = lastWithData.decomposition;
  const base = category.points[0];
  const rows = [
    { name: 'Частота покупок', value: d.freq },
    { name: 'Средний чек', value: d.ticket },
    { name: 'Взаимный эффект', value: d.cross },
  ];
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <>
      <p className="small muted">
        {category.name}: {periodLabel(lastWithData.period)} к базе {periodLabel(base.period)},
        изменение {signMoney(d.total)}
      </p>
      {rows.map((row) => (
        <div key={row.name} style={{ marginBottom: 10 }}>
          <div className="legend-row" style={{ padding: 0 }}>
            <span className="legend-row__name">{row.name}</span>
            <span className={`legend-row__val ${row.value > 0 ? 'delta-up' : row.value < 0 ? 'delta-down' : ''}`}>
              {signMoney(row.value)}
            </span>
          </div>
          <div className="progress">
            <div
              className={`progress__bar${row.value > 0 ? ' progress__bar--over' : ''}`}
              style={{ width: `${(Math.abs(row.value) / maxAbs) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <p className="small muted">
        «Частота» — изменилось число покупок, «чек» — изменилась цена одной покупки. Видно, что
        именно двигает траты.
      </p>
    </>
  );
}

function InflationBlock({
  inflation,
}: {
  inflation: NonNullable<ReturnType<typeof $inflation.getState>>;
}) {
  const lastIdx = inflation.cpi.length - 1;
  const last = inflation.cpi[lastIdx];
  return (
    <div className="grid-2">
      <div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart
            data={inflation.cpi.map((point) => ({
              month: periodLabel(point.month),
              CPI: point.value,
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} fontSize={12} />
            <YAxis domain={['auto', 'auto']} tickLine={false} fontSize={12} width={56} />
            <Tooltip />
            <Line type="monotone" dataKey="CPI" stroke="#4f6ef7" strokeWidth={2.5} dot />
          </LineChart>
        </ResponsiveContainer>
        {last && (
          <p className="small">
            Сейчас: <strong>{last.value ?? '—'}</strong> (база = 100)
            {last.mom !== null && <> · м/м: {last.mom > 0 ? '+' : ''}{last.mom}%</>}
            {last.yoy !== null && <> · г/г: {last.yoy > 0 ? '+' : ''}{last.yoy}%</>}
          </p>
        )}
      </div>
      <div>
        <h3>Корзина индекса</h3>
        <table>
          <thead>
            <tr>
              <th>Позиция</th>
              <th className="num">Базовая цена</th>
              <th className="num">Вес</th>
            </tr>
          </thead>
          <tbody>
            {inflation.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="num">{formatMoney(item.basePrice)}</td>
                <td className="num">{Math.round(item.weight * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 8 }}>
          Это изменение цен на одно и то же — измеримая часть личной инфляции (BR-12). Пропущенный
          месяц означает «цена не менялась».
        </p>
      </div>
    </div>
  );
}

// BR-12 — управление регулярными позициями
function RecurringSection() {
  const [items, tree] = useUnit([$recurring, $activeTree]);
  const busy = useUnit(createRecurringFx.pending);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isFixedPrice, setIsFixedPrice] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<RecurringItem | null>(null);

  const expenseRoots = tree.filter((c) => c.type === 'expense');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Введите название позиции');
    if (!categoryId) return setError('Выберите категорию');
    setError('');
    await createRecurringFx({ name: name.trim(), categoryId, isFixedPrice }).then(
      () => setName(''),
      () => undefined,
    );
  };

  return (
    <div className="card">
      <h2>Регулярные позиции</h2>
      <p className="section-note">
        Повторяющиеся траты с устойчивой сущностью: аренда, подписки, спортзал. Операции с меткой,
        совпадающей с названием позиции, связываются автоматически. Позиции с «фикс-ценой» попадают
        в индекс инфляции.
      </p>

      {items.map((item) => (
        <div className="legend-row" key={item.id}>
          <span className="legend-row__name">
            {item.name} <span className="muted small">· {item.categoryName}</span>{' '}
            <span className="badge">{item.txCount} оп.</span>
          </span>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={item.isFixedPrice}
              onChange={(e) =>
                updateRecurringFx({ id: item.id, input: { isFixedPrice: e.target.checked } })
              }
            />
            фикс-цена
          </label>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            title="Удалить"
            aria-label="Удалить"
            onClick={() => setDeleting(item)}
          >
            ✕
          </button>
        </div>
      ))}
      {!items.length && <div className="empty">Позиций пока нет — добавьте первую ниже</div>}

      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="form-row">
          <Field label="Название" error={error} hint="совпадает с меткой операций">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Аренда" />
          </Field>
          <Field label="Категория">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— выберите —</option>
              {expenseRoots.map((root) => (
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
          <Field label=" ">
            <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 9 }}>
              <input
                type="checkbox"
                checked={isFixedPrice}
                onChange={(e) => setIsFixedPrice(e.target.checked)}
              />
              фиксированная цена (для индекса)
            </label>
          </Field>
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Добавить
        </button>
      </form>

      {deleting && (
        <ConfirmDialog
          title={`Удалить «${deleting.name}»?`}
          text="Операции не пострадают — у них просто снимется привязка к позиции."
          confirmLabel="Удалить"
          danger
          onConfirm={() => deleteRecurringFx(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
