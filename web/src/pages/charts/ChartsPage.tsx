import { useEffect, useMemo } from 'react';
import { useUnit } from 'effector-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  $budgetStatus,
  $byCategory,
  $date,
  $includeIncome,
  $includeTransfers,
  $period,
  $series,
  chartsOpened,
  dateReset,
  dateShifted,
  incomeToggled,
  periodChanged,
  transfersToggled,
} from './model';
import { formatMoney } from '@/shared/lib/money';
import { periodTitle } from '@/shared/lib/dates';
import { TX_TYPE_LABELS, type Period } from '@/shared/api/types';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'year', label: 'Год' },
];

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function bucketLabel(period: Period, bucket: string): string {
  if (period === 'year') return MONTHS_SHORT[Number(bucket.slice(5, 7)) - 1];
  return String(Number(bucket.slice(8, 10)));
}

// FR-D1…D5 — контроль расходов за период
export function ChartsPage() {
  const [period, date, byCategory, series, budgetStatus, includeTransfers, includeIncome] =
    useUnit([
      $period,
      $date,
      $byCategory,
      $series,
      $budgetStatus,
      $includeTransfers,
      $includeIncome,
    ]);

  useEffect(() => {
    chartsOpened();
  }, []);

  const expenseItems = byCategory?.items.filter((i) => i.type === 'expense') ?? [];
  const otherItems = byCategory?.items.filter((i) => i.type !== 'expense') ?? [];

  // pivot для стопочной диаграммы FR-D3
  const seriesData = useMemo(() => {
    if (!series) return [];
    return series.buckets.map((bucket) => {
      const row: Record<string, number | string> = { bucket: bucketLabel(period, bucket) };
      for (const cat of series.categories) row[cat.name] = 0;
      for (const point of series.points) {
        if (point.bucket === bucket) {
          const cat = series.categories.find((c) => c.categoryId === point.categoryId);
          if (cat) row[cat.name] = point.amount;
        }
      }
      return row;
    });
  }, [series, period]);

  return (
    <>
      <h1>Графики</h1>

      <div className="period-bar">
        <div className="segmented" role="group" aria-label="Период">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => periodChanged(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => dateShifted(-1)} aria-label="Предыдущий период">
          ←
        </button>
        <span className="period-title">{periodTitle(period, date)}</span>
        <button type="button" className="btn" onClick={() => dateShifted(1)} aria-label="Следующий период">
          →
        </button>
        <button type="button" className="btn" onClick={() => dateReset()}>
          Сегодня
        </button>
        {/* FR-D5 — полный денежный поток по желанию */}
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={includeTransfers} onChange={() => transfersToggled()} />
          переводы
        </label>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={includeIncome} onChange={() => incomeToggled()} />
          доход
        </label>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>
            По категориям
            <span className="badge">потребление: {formatMoney(byCategory?.total ?? 0)}</span>
          </h2>
          {expenseItems.length === 0 ? (
            <div className="empty">За этот период трат нет — выберите другой период</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={expenseItems}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={95}
                    strokeWidth={1}
                  >
                    {expenseItems.map((item) => (
                      <Cell key={item.categoryId} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                {expenseItems.map((item) => (
                  <div className="legend-row" key={item.categoryId}>
                    <span className="dot" style={{ background: item.color }} aria-hidden />
                    <span className="legend-row__name">{item.name}</span>
                    <span className="legend-row__val">{formatMoney(item.amount)}</span>
                    <span className="legend-row__share">
                      {item.share !== null ? `${item.share}%` : ''}
                    </span>
                  </div>
                ))}
              </div>
              {otherItems.length > 0 && (
                <>
                  <h3 className="muted" style={{ marginTop: 12 }}>
                    Вне потребления
                  </h3>
                  {otherItems.map((item) => (
                    <div className="legend-row" key={item.categoryId}>
                      <span className="dot" style={{ background: item.color }} aria-hidden />
                      <span className="legend-row__name">
                        {item.name}{' '}
                        <span className="badge">{TX_TYPE_LABELS[item.type].toLowerCase()}</span>
                      </span>
                      <span className="legend-row__val">{formatMoney(item.amount)}</span>
                      <span className="legend-row__share" />
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h2>Внутри периода</h2>
          {period === 'day' || !series || series.points.length === 0 ? (
            <div className="empty">
              {period === 'day'
                ? 'Для дня временной ряд не строится — выберите неделю, месяц или год'
                : 'Нет данных за период'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={seriesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} fontSize={12} />
                <YAxis tickLine={false} fontSize={12} width={70} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                {series.categories.map((cat) => (
                  <Bar key={cat.categoryId} dataKey={cat.name} stackId="all" fill={cat.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {period === 'month' && budgetStatus && budgetStatus.items.length > 0 && (
        <div className="card">
          <h2>План / факт по бюджетам</h2>
          {budgetStatus.items.map((item) => {
            const ratio = item.monthlyLimit > 0 ? Math.min(item.fact / item.monthlyLimit, 1) : 0;
            return (
              <div key={item.categoryId} style={{ marginBottom: 12 }}>
                <div className="legend-row">
                  <span className="dot" style={{ background: item.categoryColor }} aria-hidden />
                  <span className="legend-row__name">{item.categoryName}</span>
                  <span className="legend-row__val">
                    {formatMoney(item.fact)} из {formatMoney(item.monthlyLimit)}
                  </span>
                  {item.overspent && (
                    // CALC-2 — подсветка перерасхода
                    <span className="badge badge--danger">+{formatMoney(item.variance)}</span>
                  )}
                </div>
                <div className="progress">
                  <div
                    className={`progress__bar${item.overspent ? ' progress__bar--over' : ''}`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
