// Чистые билдеры инлайн-клавиатур: принимают готовые данные, не ходят в сервисы.
// Все callback_data собираются через cb() — превышение 64 байт падает в тестах.

import { InlineKeyboard } from 'grammy';
import { CB, cb } from './callbacks';

const CANCEL_LABEL = 'Отмена';

export interface NamedEntity {
  id: string;
  name: string;
}

export interface AccountOption extends NamedEntity {
  currency: string;
  isDefault: boolean;
}

// Подтверждение предложенной категории (BR-7): один тап — запись.
export function kbSuggestion(categoryName: string, amountLabel: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(`✅ ${categoryName} · ${amountLabel}`, CB.confirm)
    .row()
    .text('Выбрать другую категорию', CB.pickFull)
    .row()
    .text(CANCEL_LABEL, CB.cancel);
}

// Сетка кнопок 2 в ряд — общий приём для категорий/подкатегорий/счетов.
function grid(kb: InlineKeyboard, items: Array<{ label: string; data: string }>): InlineKeyboard {
  items.forEach((item, i) => {
    kb.text(item.label, item.data);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

// withNone — пункт «Без категории» (c:-); нужен переводам, где категория необязательна.
export function kbCategoryRoots(
  roots: NamedEntity[],
  opts: { withNone?: boolean } = {},
): InlineKeyboard {
  const kb = grid(
    new InlineKeyboard(),
    roots.map((r) => ({ label: r.name, data: cb(CB.category, r.id) })),
  );
  if (opts.withNone) kb.row().text('Без категории', cb(CB.category, '-'));
  return kb.row().text(CANCEL_LABEL, CB.cancel);
}

export function kbSubcategories(children: NamedEntity[]): InlineKeyboard {
  const kb = grid(
    new InlineKeyboard(),
    children.map((c) => ({ label: c.name, data: cb(CB.subcategory, c.id) })),
  );
  return kb
    .row()
    .text('Без подкатегории', cb(CB.subcategory, '-'))
    .row()
    .text(CANCEL_LABEL, CB.cancel);
}

// Счета: основной — первым (✅), запись в один тап.
// excludeId — спрятать счёт (получатель ≠ источник); withOutside — пункт «Вне счетов» (a:-).
export function kbAccounts(
  accounts: AccountOption[],
  opts: { excludeId?: string; withOutside?: boolean } = {},
): InlineKeyboard {
  const ordered = [...accounts]
    .filter((a) => a.id !== opts.excludeId)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const kb = grid(
    new InlineKeyboard(),
    ordered.map((a) => ({
      label: `${a.isDefault ? '✅ ' : ''}${a.name} (${a.currency})`,
      data: cb(CB.account, a.id),
    })),
  );
  if (opts.withOutside) kb.row().text('Вне счетов (снятие/сторонний)', cb(CB.account, '-'));
  return kb.row().text(CANCEL_LABEL, CB.cancel);
}

// Финальное подтверждение (сводка перевода и т.п.).
export function kbConfirm(confirmLabel = '✅ Записать'): InlineKeyboard {
  return new InlineKeyboard().text(confirmLabel, CB.confirm).text(CANCEL_LABEL, CB.cancel);
}

// Список операций: кнопки-номера открывают карточку, ‹ › листают, «Фильтры» — меню.
export function kbHistory(txIds: string[], page: number, pages: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  txIds.forEach((id, i) => {
    // Нумерация в пределах страницы — совпадает со строками списка.
    kb.text(String(i + 1), cb(CB.history, 'o', id));
    if (i % 5 === 4) kb.row();
  });
  if (txIds.length % 5 !== 0) kb.row();

  if (pages > 1) {
    if (page > 0) kb.text('‹', cb(CB.history, 'p', page - 1));
    kb.text(`стр. ${page + 1}/${pages}`, CB.noop);
    if (page < pages - 1) kb.text('›', cb(CB.history, 'p', page + 1));
    kb.row();
  }
  return kb.text('⚙️ Фильтры', cb(CB.history, 'f'));
}

// Меню фильтров истории.
export function kbHistoryFilters(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Все', cb(CB.history, 'ft', '-'))
    .text('Траты', cb(CB.history, 'ft', 'e'))
    .text('Доходы', cb(CB.history, 'ft', 'i'))
    .text('Переводы', cb(CB.history, 'ft', 't'))
    .row()
    .text('Категория', cb(CB.history, 'fc'))
    .text('Счёт', cb(CB.history, 'fa'))
    .row()
    .text('🔍 Поиск по метке', cb(CB.history, 'fq'))
    .row()
    .text('Месяц', cb(CB.history, 'fd', 'm'))
    .text('Прош. месяц', cb(CB.history, 'fd', 'pm'))
    .text('Всё время', cb(CB.history, 'fd', '-'))
    .row()
    .text('📅 Свой период', cb(CB.history, 'fd', 'c'))
    .row()
    .text('♻️ Сбросить фильтры', cb(CB.history, 'fx'))
    .row()
    .text('‹ К списку', cb(CB.history, 'b'));
}

// Карточка операции: правка полей и удаление.
export function kbTxCard(txId: string, type: string): InlineKeyboard {
  const e = (f: string) => cb(CB.edit, txId, f);
  const kb = new InlineKeyboard()
    .text('Сумма', e('a'))
    .text('Дата', e('d'))
    .row();
  // У перевода категория/метка в боте не редактируются (обычно не нужны),
  // счёт списания — тоже: за ним тянутся курс и сумма зачисления.
  if (type !== 'transfer') {
    kb.text('Категория', e('c')).text('Счёт', e('w')).row();
    kb.text('Метка', e('l')).text('Заметка', e('n')).row();
  } else {
    kb.text('Заметка', e('n')).row();
  }
  return kb.text('🗑 Удалить', e('x')).row().text('‹ К списку', cb(CB.history, 'b'));
}

export function kbConfirmDelete(txId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🗑 Да, удалить', cb(CB.edit, txId, 'xy'))
    .text('Нет', cb(CB.history, 'o', txId));
}

// Быстрый выбор даты при редактировании (или дата текстом).
export function kbEditDate(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Сегодня', cb(CB.editDate, 't'))
    .text('Вчера', cb(CB.editDate, 'y'));
}

// Теги — кнопками, отчёт по нажатию.
export function kbTags(tags: NamedEntity[]): InlineKeyboard {
  return grid(
    new InlineKeyboard(),
    tags.map((t) => ({ label: t.name, data: cb(CB.tag, t.id) })),
  );
}

// Статус бюджетов + действие.
export function kbBudget(): InlineKeyboard {
  return new InlineKeyboard().text('✏️ Задать лимит', cb(CB.budget, 's'));
}

// Пресеты периодов статистики. Все кнопки несут текущий флаг доходов (:i),
// чтобы переключение периода не сбрасывало режим; toggleData — перерисовка
// текущего представления с противоположным флагом.
export function kbStats(income: boolean, toggleData: string): InlineKeyboard {
  const preset = (p: string) => (income ? cb(CB.period, 's', p, 'i') : cb(CB.period, 's', p));
  return new InlineKeyboard()
    .text('Сегодня', preset('d'))
    .text('Вчера', preset('y'))
    .text('Неделя', preset('w'))
    .row()
    .text('Месяц', preset('m'))
    .text('Прош. месяц', preset('pm'))
    .text('Год', preset('yr'))
    .row()
    .text('📅 Свой диапазон', preset('c'))
    .row()
    .text(income ? '💰 Скрыть доходы' : '💰 Показать доходы', toggleData)
    .row()
    .text('📈 Динамика 6 мес', cb(CB.dynamics, 6))
    .text('📈 12 мес', cb(CB.dynamics, 12));
}
