import { useEffect, useMemo, useState } from 'react';
import { useUnit } from 'effector-react';
import {
  $customFrom,
  $customTo,
  $loadError,
  $preset,
  $selected,
  $totals,
  customFromChanged,
  customToChanged,
  presetChanged,
  selectionCleared,
  selectionToggled,
  summaryOpened,
} from './model';
import { childRowId, selectionSums, type RangePreset } from './lib';
import { Field } from '@/shared/ui/Field';
import { formatMoney } from '@/shared/lib/money';
import { TX_TYPE_LABELS, type CategoryTotalsItem, type TxType } from '@/shared/api/types';

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'month', label: 'Этот месяц' },
  { value: 'prevMonth', label: 'Прошлый месяц' },
  { value: 'year', label: 'Этот год' },
  { value: 'all', label: 'Всё время' },
  { value: 'custom', label: 'Свой период' },
];

const TYPE_ORDER: TxType[] = ['expense', 'income', 'transfer'];

// FR-D6 — сумма трат или доходов по выбранным категориям и подкатегориям
// за любой период. Период задаётся пресетом или датами, выбор — галочками.
export function SummaryPage() {
  const [preset, customFrom, customTo, totals, selected, loadError] = useUnit([
    $preset,
    $customFrom,
    $customTo,
    $totals,
    $selected,
    $loadError,
  ]);
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    summaryOpened();
  }, []);

  const items = useMemo(() => totals?.items ?? [], [totals]);
  const selection = selectionSums(items, selected);
  const selectionTypes = TYPE_ORDER.filter((type) => selection.totals[type] !== 0);

  // Категории сгруппированы по типу операций; max — для шкалы внутри группы.
  const groups = useMemo(
    () =>
      TYPE_ORDER.map((type) => {
        const rows = items.filter((i) => i.type === type);
        return { type, rows, max: Math.max(...rows.map((i) => i.amount), 0) };
      }).filter((g) => g.rows.length > 0),
    [items],
  );

  const toggleExpanded = (id: string) =>
    setExpanded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <>
      <h1>Сводка по категориям</h1>
      <p className="section-note">
        Сколько ушло или пришло по каждой категории и подкатегории. Отметьте любые строки —
        внизу шапки появится их общая сумма.
      </p>

      <div className="period-bar">
        <div className="segmented" role="group" aria-label="Период">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              onClick={() => presetChanged(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <Field label="С даты">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => customFromChanged(e.target.value)}
              />
            </Field>
            <Field label="По дату">
              <input
                type="date"
                value={customTo}
                onChange={(e) => customToChanged(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>

      <div className="acc-totals">
        {TYPE_ORDER.map((type) => (
          <div className="card acc-total" key={type}>
            <div className="acc-total__label">{TX_TYPE_LABELS[type]}</div>
            <div className="stat">{totals ? formatMoney(totals.totals[type]) : '—'}</div>
          </div>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="card">
          <h2>
            Сумма выбранного
            <span className="badge badge--info">{selection.rows} стр.</span>
            <button type="button" className="btn btn--ghost" onClick={() => selectionCleared()}>
              Сбросить выбор
            </button>
          </h2>
          {selectionTypes.length === 0 ? (
            <div className="empty">В выбранных строках нет операций за этот период</div>
          ) : (
            <div className="acc-totals" style={{ marginBottom: 0 }}>
              {selectionTypes.map((type) => (
                <div key={type}>
                  <div className="acc-total__label">{TX_TYPE_LABELS[type]}</div>
                  <div className="stat">{formatMoney(selection.totals[type])}</div>
                </div>
              ))}
            </div>
          )}
          {selectionTypes.length > 1 && (
            <p className="small muted">
              Выбраны категории разных типов — суммы показаны отдельно, складывать их нельзя.
            </p>
          )}
        </div>
      )}

      {loadError ? (
        <div className="card">
          <div className="empty">
            <p>Не удалось загрузить сводку: {loadError}</p>
            <p className="small">
              Разделу нужен маршрут <code>GET /analytics/category-totals</code> — если API ещё
              не обновлён, обновите бэкенд и перезагрузите страницу.
            </p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="empty">За этот период операций нет — выберите другой период</div>
        </div>
      ) : (
        groups.map(({ type, rows, max }) => (
          <div className="card" key={type}>
            <h2>
              {TX_TYPE_LABELS[type]}
              <span className="badge">{formatMoney(totals?.totals[type] ?? 0)}</span>
            </h2>
            {rows.map((item) => (
              <CategoryRows
                key={item.categoryId}
                item={item}
                max={max}
                selected={selected}
                expanded={expanded.includes(item.categoryId)}
                onToggleExpanded={() => toggleExpanded(item.categoryId)}
              />
            ))}
          </div>
        ))
      )}
    </>
  );
}

function CategoryRows({
  item,
  max,
  selected,
  expanded,
  onToggleExpanded,
}: {
  item: CategoryTotalsItem;
  max: number;
  selected: string[];
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const hasChildren = item.children.length > 0;
  return (
    <>
      <div className="cat-row">
        <input
          type="checkbox"
          checked={selected.includes(item.categoryId)}
          onChange={() => selectionToggled(item.categoryId)}
          aria-label={`Выбрать «${item.name}»`}
        />
        {hasChildren ? (
          <button
            type="button"
            className="icon-btn"
            aria-expanded={expanded}
            aria-label={expanded ? 'Свернуть подкатегории' : 'Показать подкатегории'}
            onClick={onToggleExpanded}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="icon-btn" aria-hidden style={{ visibility: 'hidden' }} />
        )}
        <span className="dot" style={{ background: item.color }} aria-hidden />
        <div className="cat-row__main">
          <div className="cat-row__name">{item.name}</div>
          <div className="cat-row__desc">
            {item.count} оп.
            {item.share !== null && ` · ${item.share}%`}
            {hasChildren && ` · подкатегорий: ${item.children.filter((c) => c.categoryId).length}`}
          </div>
          <div className="progress" style={{ marginTop: 4 }}>
            <div
              className="progress__bar"
              style={{ width: `${max > 0 ? (item.amount / max) * 100 : 0}%` }}
            />
          </div>
        </div>
        <span className="legend-row__val">{formatMoney(item.amount)}</span>
      </div>

      {expanded &&
        item.children.map((child) => {
          const rowId = childRowId(item.categoryId, child.categoryId);
          const covered = selected.includes(item.categoryId);
          return (
            <div className="cat-row cat-row--child" key={rowId}>
              <input
                type="checkbox"
                checked={covered || selected.includes(rowId)}
                disabled={covered}
                onChange={() => selectionToggled(rowId)}
                aria-label={`Выбрать «${child.name}»`}
              />
              <div className="cat-row__main">
                <div>{child.name}</div>
                <div className="cat-row__desc">
                  {child.count} оп.
                  {child.share !== null && ` · ${child.share}% категории`}
                </div>
              </div>
              <span className="legend-row__val">{formatMoney(child.amount)}</span>
            </div>
          );
        })}
    </>
  );
}
