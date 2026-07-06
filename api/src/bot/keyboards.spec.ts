import { type InlineKeyboard } from 'grammy';
import { kbAccounts, kbCategoryRoots, kbSubcategories, kbSuggestion } from './keyboards';

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
