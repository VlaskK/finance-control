// Состояние диалога с ботом: один активный диалог на пользователя.
// Хранится в памяти процесса (бот — единственный инстанс, пользователей — единицы),
// протухает по TTL, любая команда или новый ввод суммы начинают диалог заново.

import { Injectable } from '@nestjs/common';

// Черновик ввода траты. В следующих итерациях union расширяется режимами
// income/transfer/history/edit/budget_set — диспетчеризация по полю mode.
export interface EntryDraft {
  mode: 'expense';
  amount: number;
  label: string | null;
  note: string | null;
  rootId?: string;
  subId?: string | null;
  suggestion?: { categoryId: string; subcategoryId: string | null };
  accountId?: string;
  awaitingRate?: boolean;
}

export type Session = EntryDraft;

const TTL_MS = 30 * 60 * 1000;

@Injectable()
export class SessionStore {
  private readonly map = new Map<number, { session: Session; touchedAt: number }>();

  get(userId: number): Session | undefined {
    const entry = this.map.get(userId);
    if (!entry) return undefined;
    if (Date.now() - entry.touchedAt > TTL_MS) {
      this.map.delete(userId);
      return undefined;
    }
    return entry.session;
  }

  set(userId: number, session: Session): void {
    this.map.set(userId, { session, touchedAt: Date.now() });
  }

  clear(userId: number): void {
    this.map.delete(userId);
  }
}
