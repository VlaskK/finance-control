import { useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import { api } from '@/shared/api/client';
import { $tags, createTagFx, deleteTagFx } from '@/entities/tag/model';
import { categoriesInvalidated } from '@/entities/category/model';
import { transactionsInvalidated } from '@/entities/transaction/model';
import { tagsInvalidated } from '@/entities/tag/model';
import { Field } from '@/shared/ui/Field';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { notify } from '@/shared/ui/toast';
import { formatMoney } from '@/shared/lib/money';
import { todayIso } from '@/shared/lib/dates';
import { TX_TYPE_LABELS, type ImportResult, type TagRef, type TagReport, type TxType } from '@/shared/api/types';

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// FR-G — данные: самое ценное в финансовом приложении
export function DataPage() {
  return (
    <>
      <h1>Данные</h1>
      <div className="grid-2">
        <ExportCard />
        <ImportCsvCard />
      </div>
      <div className="grid-2">
        <RestoreCard />
        <TagsCard />
      </div>
    </>
  );
}

// FR-G1 — экспорт-бэкап
function ExportCard() {
  const [busy, setBusy] = useState(false);

  const exportJson = async () => {
    setBusy(true);
    try {
      const dump = await api.get<object>('/export');
      download(`finflow-backup-${todayIso()}.json`, JSON.stringify(dump, null, 2), 'application/json');
      notify('Бэкап сохранён');
    } catch {
      notify('Не удалось выгрузить данные — проверьте, запущен ли бэкенд', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    setBusy(true);
    try {
      const csv = await api.get<string>('/export/csv');
      // BOM — чтобы Excel открыл кириллицу корректно
      download(`finflow-operations-${todayIso()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      notify('CSV сохранён');
    } catch {
      notify('Не удалось выгрузить данные — проверьте, запущен ли бэкенд', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Экспорт</h2>
      <p className="section-note">
        JSON — полный бэкап (его можно восстановить), CSV — операции для Excel.
      </p>
      <div className="form-row">
        <button type="button" className="btn btn--primary" onClick={exportJson} disabled={busy}>
          Скачать JSON-бэкап
        </button>
        <button type="button" className="btn" onClick={exportCsv} disabled={busy}>
          Скачать CSV
        </button>
      </div>
    </div>
  );
}

// FR-G2 — перенос истории из Excel/CSV
function ImportCsvCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [defaultType, setDefaultType] = useState<TxType>('expense');
  const [result, setResult] = useState<ImportResult | null>(null);

  const importFile = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      notify('Выберите CSV-файл', 'error');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await api.post<ImportResult>('/import', { csv, defaultType });
      setResult(res);
      notify(`Импортировано операций: ${res.imported}`);
      transactionsInvalidated();
      categoriesInvalidated();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось импортировать файл', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="card">
      <h2>Импорт из CSV</h2>
      <p className="section-note">
        Нужны колонки «дата», «сумма», «категория» (или date, amount, category); необязательные —
        подкатегория, метка, примечание, тип. Незнакомые категории создадутся автоматически.
      </p>
      <Field label="Файл">
        <input ref={fileRef} type="file" accept=".csv,text/csv" />
      </Field>
      <Field label="Тип операций по умолчанию" hint="если в файле нет колонки «тип»">
        <select value={defaultType} onChange={(e) => setDefaultType(e.target.value as TxType)}>
          {(Object.keys(TX_TYPE_LABELS) as TxType[]).map((t) => (
            <option key={t} value={t}>
              {TX_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <button type="button" className="btn btn--primary" onClick={importFile} disabled={busy}>
        Импортировать
      </button>
      {result && (
        <div style={{ marginTop: 12 }}>
          <p className="small">
            Импортировано: <strong>{result.imported}</strong>, пропущено:{' '}
            <strong>{result.skipped.length}</strong>
          </p>
          {result.skipped.slice(0, 10).map((s) => (
            <p className="small muted" key={s.line}>
              Строка {s.line}: {s.reason}
            </p>
          ))}
          {result.skipped.length > 10 && (
            <p className="small muted">…и ещё {result.skipped.length - 10}</p>
          )}
        </div>
      )}
    </div>
  );
}

// FR-G3 — восстановление из JSON-бэкапа
function RestoreCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<object | null>(null);

  const pickFile = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      notify('Выберите JSON-файл бэкапа', 'error');
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('transactions' in parsed) ||
        !('categories' in parsed)
      ) {
        notify('Выберите файл, созданный кнопкой «Скачать JSON-бэкап»', 'error');
        return;
      }
      setPending(parsed);
    } catch {
      notify('Файл не читается как JSON — выберите файл бэкапа', 'error');
    }
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await api.post('/import/restore', { data: pending });
      notify('Данные восстановлены');
      transactionsInvalidated();
      categoriesInvalidated();
      tagsInvalidated();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось восстановить бэкап', 'error');
    } finally {
      setBusy(false);
      setPending(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="card">
      <h2>Восстановление из бэкапа</h2>
      <p className="section-note">
        Полностью заменяет текущие данные содержимым JSON-бэкапа.
      </p>
      <Field label="Файл бэкапа">
        <input ref={fileRef} type="file" accept=".json,application/json" />
      </Field>
      <button type="button" className="btn btn--danger" onClick={pickFile} disabled={busy}>
        Восстановить…
      </button>
      {pending && (
        <ConfirmDialog
          title="Заменить все данные?"
          text="Текущие операции, категории, бюджеты и теги будут удалены и заменены данными из бэкапа. Действие необратимо."
          confirmLabel="Заменить"
          danger
          onConfirm={restore}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}

// BR-9 — теги: сквозное измерение поверх категорий
function TagsCard() {
  const tags = useUnit($tags);
  const [name, setName] = useState('');
  const [report, setReport] = useState<TagReport | null>(null);
  const [deleting, setDeleting] = useState<TagRef | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createTagFx(name.trim()).then(() => setName(''), () => undefined);
  };

  const showReport = async (tag: TagRef) => {
    try {
      setReport(await api.get<TagReport>(`/tags/${tag.id}/report`));
    } catch {
      notify('Не удалось построить отчёт', 'error');
    }
  };

  return (
    <div className="card">
      <h2>Теги</h2>
      <p className="section-note">
        Группируют операции разных категорий вокруг события: «отпуск-тбилиси-2026», ремонт, проект.
      </p>
      <div className="chips" style={{ marginBottom: 12 }}>
        {tags.map((tag) => (
          <span key={tag.id} className="chip" style={{ display: 'inline-flex', gap: 6 }}>
            <button
              type="button"
              style={{ all: 'unset', cursor: 'pointer' }}
              onClick={() => showReport(tag)}
              title="Отчёт по тегу"
            >
              {tag.name}
            </button>
            <button
              type="button"
              style={{ all: 'unset', cursor: 'pointer', opacity: 0.5 }}
              aria-label={`Удалить тег ${tag.name}`}
              onClick={() => setDeleting(tag)}
            >
              ✕
            </button>
          </span>
        ))}
        {!tags.length && <span className="muted small">Тегов пока нет</span>}
      </div>
      <form onSubmit={create} className="form-row">
        <Field label="Новый тег">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="отпуск-тбилиси-2026"
          />
        </Field>
        <button type="submit" className="btn" style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
          Добавить
        </button>
      </form>

      {report && (
        <div style={{ marginTop: 8 }}>
          <h3>
            «{report.tag.name}» — всего {formatMoney(report.total)}
          </h3>
          {report.byCategory.map((row) => (
            <div className="legend-row" key={row.categoryId}>
              <span className="dot" style={{ background: row.categoryColor }} aria-hidden />
              <span className="legend-row__name">
                {row.categoryName} <span className="muted small">({row.count} оп.)</span>
              </span>
              <span className="legend-row__val">{formatMoney(row.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Удалить тег «${deleting.name}»?`}
          text="Операции не пострадают — тег просто исчезнет с них."
          confirmLabel="Удалить"
          danger
          onConfirm={() => {
            deleteTagFx(deleting.id);
            setReport(null);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
