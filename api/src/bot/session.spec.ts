import { SessionStore, type EntryDraft } from './session';

const draft: EntryDraft = { mode: 'expense', amount: 200, label: 'кофе', note: null };

describe('SessionStore', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('set/get возвращает сессию', () => {
    const store = new SessionStore();
    store.set(1, draft);
    expect(store.get(1)).toEqual(draft);
  });

  it('clear удаляет', () => {
    const store = new SessionStore();
    store.set(1, draft);
    store.clear(1);
    expect(store.get(1)).toBeUndefined();
  });

  it('сессии разных пользователей независимы', () => {
    const store = new SessionStore();
    store.set(1, draft);
    expect(store.get(2)).toBeUndefined();
  });

  it('протухает после 30 минут', () => {
    const store = new SessionStore();
    store.set(1, draft);
    jest.advanceTimersByTime(29 * 60 * 1000);
    expect(store.get(1)).toEqual(draft);
    jest.advanceTimersByTime(2 * 60 * 1000);
    expect(store.get(1)).toBeUndefined();
  });
});
