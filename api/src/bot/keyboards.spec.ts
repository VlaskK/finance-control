import { type InlineKeyboard } from 'grammy';
import {
  kbAccounts,
  kbCategoryRoots,
  kbConfirmDelete,
  kbHistory,
  kbHistoryFilters,
  kbStats,
  kbSubcategories,
  kbSuggestion,
  kbTxCard,
} from './keyboards';

const UUID_A = 'db086d6c-ab5f-4009-941b-767d3b8496a0';
const UUID_B = '405e7a94-de68-4571-a37c-cddc0d188dc5';
const UUID_C = '9c1f6f3a-1111-2222-3333-444455556666';

// Общая проверка для всех билдеров: каждая кнопка имеет валидный callback_data ≤ 64 байт.
function assertValidCallbacks(kb: InlineKeyboard) {
  const buttons = kb.inline_keyboard.flat();
  expect(buttons.length).toBeGreaterThan(0);
  for (const b of buttons) {
    const data = (b as { callback_data?: string }).callback_data;
    expect(typeof data).toBe('string');
    expect(Buffer.byteLength(data!, 'utf8')).toBeLessThanOrEqual(64);
  }
}

describe('kbSuggestion', () => {
  it('три ряда: подтвердить / выбрать / отмена', () => {
    const kb = kbSuggestion('Еда', '200 ₽');
    assertValidCallbacks(kb);
    expect(kb.inline_keyboard).toHaveLength(3);
    expect(kb.inline_keyboard[0][0]).toMatchObject({ callback_data: 'g' });
    expect(kb.inline_keyboard[2][0]).toMatchObject({ callback_data: 'x' });
  });
});

describe('kbCategoryRoots', () => {
  it('раскладывает категории по 2 в ряд + ряд отмены', () => {
    const kb = kbCategoryRoots([
      { id: UUID_A, name: 'Еда' },
      { id: UUID_B, name: 'Дом' },
      { id: UUID_C, name: 'Такси' },
    ]);
    assertValidCallbacks(kb);
    expect(kb.inline_keyboard[0]).toHaveLength(2);
    expect(kb.inline_keyboard[0][0]).toMatchObject({ callback_data: `c:${UUID_A}` });
    const last = kb.inline_keyboard.at(-1)!;
    expect(last[0]).toMatchObject({ callback_data: 'x' });
  });

  it('withNone добавляет «Без категории» (c:-)', () => {
    const kb = kbCategoryRoots([{ id: UUID_A, name: 'Накопления' }], { withNone: true });
    assertValidCallbacks(kb);
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).toContain('c:-');
  });
});

describe('kbSubcategories', () => {
  it('содержит «Без подкатегории» (s:-) и отмену', () => {
    const kb = kbSubcategories([{ id: UUID_A, name: 'Кофе' }]);
    assertValidCallbacks(kb);
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).toContain('s:-');
    expect(all).toContain('x');
    expect(all).toContain(`s:${UUID_A}`);
  });
});

describe('kbStats', () => {
  it('пресеты без флага доходов, тумблер — переданный callback', () => {
    const kb = kbStats(false, 'p:s:m:i');
    assertValidCallbacks(kb);
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).toContain('p:s:d');
    expect(all).toContain('p:s:pm');
    expect(all).toContain('p:s:m:i'); // тумблер
    expect(all).toContain('dn:6');
    expect(all).toContain('dn:12');
  });

  it('в режиме доходов пресеты несут флаг :i', () => {
    const kb = kbStats(true, 'p:s:m');
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).toContain('p:s:d:i');
    expect(all).toContain('p:s:yr:i');
  });

  it('диапазонный тумблер укладывается в 64 байта', () => {
    const kb = kbStats(false, 'p:s:r:20260601:20260630:i');
    assertValidCallbacks(kb);
  });
});

describe('kbHistory', () => {
  const ids = [UUID_A, UUID_B, UUID_C];

  it('номера страницы, навигация и фильтры; все callback ≤ 64 Б', () => {
    const kb = kbHistory(ids, 1, 3);
    assertValidCallbacks(kb);
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).toContain(`h:o:${UUID_A}`);
    expect(all).toContain('h:p:0'); // ‹
    expect(all).toContain('h:p:2'); // ›
    expect(all).toContain('-'); // индикатор страницы
    expect(all).toContain('h:f');
  });

  it('на единственной странице нет навигации', () => {
    const kb = kbHistory(ids, 0, 1);
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).not.toContain('-');
  });
});

describe('kbHistoryFilters', () => {
  it('типы, категория/счёт, поиск, периоды, сброс', () => {
    const kb = kbHistoryFilters();
    assertValidCallbacks(kb);
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).toEqual(
      expect.arrayContaining(['h:ft:e', 'h:ft:-', 'h:fc', 'h:fa', 'h:fq', 'h:fd:m', 'h:fx', 'h:b']),
    );
  });
});

describe('kbTxCard / kbConfirmDelete', () => {
  it('у обычной операции — все поля; callback с UUID укладываются в лимит', () => {
    const kb = kbTxCard(UUID_A, 'expense');
    assertValidCallbacks(kb);
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).toEqual(
      expect.arrayContaining([
        `e:${UUID_A}:a`,
        `e:${UUID_A}:c`,
        `e:${UUID_A}:w`,
        `e:${UUID_A}:x`,
        'h:b',
      ]),
    );
  });

  it('у перевода нет смены категории/счёта/метки', () => {
    const all = kbTxCard(UUID_A, 'transfer')
      .inline_keyboard.flat()
      .map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).not.toContain(`e:${UUID_A}:c`);
    expect(all).not.toContain(`e:${UUID_A}:w`);
    expect(all).toContain(`e:${UUID_A}:n`);
  });

  it('подтверждение удаления: да/нет', () => {
    const kb = kbConfirmDelete(UUID_A);
    assertValidCallbacks(kb);
    const all = kb.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data);
    expect(all).toContain(`e:${UUID_A}:xy`);
    expect(all).toContain(`h:o:${UUID_A}`);
  });
});

describe('kbAccounts', () => {
  it('основной счёт первым и помечен ✅', () => {
    const kb = kbAccounts([
      { id: UUID_A, name: 'Валютный', currency: 'USD', isDefault: false },
      { id: UUID_B, name: 'Общий', currency: 'RUB', isDefault: true },
    ]);
    assertValidCallbacks(kb);
    const first = kb.inline_keyboard[0][0] as { text: string; callback_data: string };
    expect(first.text).toBe('✅ Общий (RUB)');
    expect(first.callback_data).toBe(`a:${UUID_B}`);
  });
});
