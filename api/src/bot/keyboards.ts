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

export function kbCategoryRoots(roots: NamedEntity[]): InlineKeyboard {
  const kb = grid(
    new InlineKeyboard(),
    roots.map((r) => ({ label: r.name, data: cb(CB.category, r.id) })),
  );
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
