import { useMemo, useState } from 'react';
import { useUnit } from 'effector-react';
import { $categoryTree } from '@/entities/category/model';
import {
  createCategoryFx,
  deleteCategoryFx,
  mergeCategoryFx,
  updateCategoryFx,
} from '@/features/manage-categories/model';
import { Field } from '@/shared/ui/Field';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import {
  TX_TYPE_LABELS,
  type Category,
  type CategoryNode,
  type TxType,
} from '@/shared/api/types';

const TYPES: TxType[] = ['expense', 'transfer', 'income'];

const SECTION_TITLES: Record<TxType, string> = {
  expense: 'Расходы',
  transfer: 'Переводы и накопления',
  income: 'Доходы',
};

// FR-C1…C4, C7 — дерево, создание, правка, архив, слияние, определения
export function CategoriesPage() {
  const tree = useUnit($categoryTree);
  const [editing, setEditing] = useState<Category | null>(null);
  const [merging, setMerging] = useState<Category | null>(null);
  const [archiving, setArchiving] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  return (
    <>
      <h1>Категории</h1>

      <div className="card">
        <h2>Новая категория</h2>
        <CreateCategoryForm tree={tree} />
      </div>

      {TYPES.map((type) => (
        <div className="card" key={type}>
          <h2>{SECTION_TITLES[type]}</h2>
          {tree
            .filter((c) => c.type === type)
            .map((root) => (
              <div key={root.id}>
                <CategoryRow
                  category={root}
                  onEdit={setEditing}
                  onMerge={setMerging}
                  onArchive={setArchiving}
                  onDelete={setDeleting}
                />
                {root.children.map((child) => (
                  <CategoryRow
                    key={child.id}
                    category={child}
                    child
                    onEdit={setEditing}
                    onMerge={setMerging}
                    onArchive={setArchiving}
                    onDelete={setDeleting}
                  />
                ))}
              </div>
            ))}
        </div>
      ))}

      {editing && <EditCategoryModal category={editing} onClose={() => setEditing(null)} />}
      {merging && (
        <MergeCategoryModal category={merging} tree={tree} onClose={() => setMerging(null)} />
      )}
      {archiving && (
        // BR-3 — архив обратим и не трогает историю
        <ConfirmDialog
          title={`Архивировать «${archiving.name}»?`}
          text="Категория исчезнет из экрана ввода, но останется в истории и аналитике. Подкатегории уйдут в архив вместе с ней. Действие обратимо."
          confirmLabel="Архивировать"
          onConfirm={() => updateCategoryFx({ id: archiving.id, input: { active: false } })}
          onClose={() => setArchiving(null)}
        />
      )}
      {deleting && (
        // BR-4 — сервер удалит только пустую категорию
        <ConfirmDialog
          title={`Удалить «${deleting.name}» навсегда?`}
          text="Удаление возможно только для категорий без операций. Если категория использовалась — заархивируйте или слейте её."
          confirmLabel="Удалить"
          danger
          onConfirm={() => deleteCategoryFx(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function CategoryRow({
  category,
  child,
  onEdit,
  onMerge,
  onArchive,
  onDelete,
}: {
  category: Category;
  child?: boolean;
  onEdit: (c: Category) => void;
  onMerge: (c: Category) => void;
  onArchive: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  return (
    <div
      className={`cat-row${child ? ' cat-row--child' : ''}${category.active ? '' : ' cat-row--archived'}`}
    >
      <span className="dot" style={{ background: category.color }} aria-hidden />
      <div className="cat-row__main">
        <span className="cat-row__name">{category.name}</span>{' '}
        {!category.active && <span className="badge">архив</span>}
        {category.description && <div className="cat-row__desc">{category.description}</div>}
      </div>
      <div className="cat-row__actions">
        <button type="button" className="icon-btn" title="Изменить" aria-label="Изменить" onClick={() => onEdit(category)}>
          ✎
        </button>
        <button type="button" className="icon-btn" title="Слить с другой" aria-label="Слить с другой" onClick={() => onMerge(category)}>
          ⇄
        </button>
        {category.active ? (
          <button type="button" className="icon-btn" title="Архивировать" aria-label="Архивировать" onClick={() => onArchive(category)}>
            ⬇
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn"
            title="Вернуть из архива"
            aria-label="Вернуть из архива"
            onClick={() => updateCategoryFx({ id: category.id, input: { active: true } })}
          >
            ⬆
          </button>
        )}
        <button type="button" className="icon-btn icon-btn--danger" title="Удалить" aria-label="Удалить" onClick={() => onDelete(category)}>
          ✕
        </button>
      </div>
    </div>
  );
}

// FR-C1 — создание категории/подкатегории
function CreateCategoryForm({ tree }: { tree: CategoryNode[] }) {
  const busy = useUnit(createCategoryFx.pending);
  const [type, setType] = useState<TxType>('expense');
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4f6ef7');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const roots = tree.filter((c) => c.type === type && c.active);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Введите название');
      return;
    }
    setError('');
    await createCategoryFx({
      name: name.trim(),
      type,
      parentId: parentId || null,
      color,
      description: description.trim() || null,
    }).then(() => {
      setName('');
      setDescription('');
    }, () => undefined);
  };

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <Field label="Название" error={error}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Питомцы" />
        </Field>
        <Field label="Тип">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as TxType);
              setParentId('');
            }}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TX_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Родитель" hint="пусто — категория верхнего уровня">
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">—</option>
            {roots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Цвет">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
      </div>
      <Field label="Что сюда входит" hint="определение для консистентной классификации (BR-8)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Корм, ветеринар, амуниция"
        />
      </Field>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        Добавить
      </button>
    </form>
  );
}

// FR-C2 / FR-C7 — переименование (BR-2) и определение
function EditCategoryModal({ category, onClose }: { category: Category; onClose: () => void }) {
  const busy = useUnit(updateCategoryFx.pending);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [description, setDescription] = useState(category.description ?? '');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Введите название');
      return;
    }
    await updateCategoryFx({
      id: category.id,
      input: { name: name.trim(), color, description: description.trim() || null },
    }).then(onClose, () => undefined);
  };

  return (
    <Modal title="Категория" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Название" error={error} hint="операции и отчёты не затрагиваются (BR-2)">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Цвет">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
        <Field label="Что сюда входит">
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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

// FR-C4 / BR-5 — слияние внутри одного типа
function MergeCategoryModal({
  category,
  tree,
  onClose,
}: {
  category: Category;
  tree: CategoryNode[];
  onClose: () => void;
}) {
  const busy = useUnit(mergeCategoryFx.pending);
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState('');

  const targets = useMemo(() => {
    const result: { id: string; label: string }[] = [];
    for (const root of tree) {
      if (root.type !== category.type || !root.active) continue;
      if (root.id !== category.id) result.push({ id: root.id, label: root.name });
      for (const child of root.children) {
        if (!child.active || child.id === category.id || child.parentId === category.id) continue;
        result.push({ id: child.id, label: `${root.name} → ${child.name}` });
      }
    }
    return result;
  }, [tree, category]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) {
      setError('Выберите целевую категорию');
      return;
    }
    await mergeCategoryFx({ id: category.id, targetId }).then(onClose, () => undefined);
  };

  return (
    <Modal title={`Слить «${category.name}»`} onClose={onClose}>
      <p className="confirm-text">
        Все операции категории переедут в целевую, выученные метки и бюджет последуют за ними, а
        «{category.name}» уйдёт в архив. История не теряется.
      </p>
      <form onSubmit={submit}>
        <Field label="Куда слить" error={error}>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">— выберите —</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            Слить
          </button>
        </div>
      </form>
    </Modal>
  );
}
