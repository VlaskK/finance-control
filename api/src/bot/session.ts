// Состояние диалога с ботом: один активный диалог на пользователя.
// Хранится в памяти процесса (бот — единственный инстанс, пользователей — единицы),
// протухает по TTL, любая команда или новый ввод суммы начинают диалог заново.

import { Injectable } from '@nestjs/common';

// Черновик ввода траты или дохода: флоу общий, различается типом категорий
// (expense/income), отсутствием бюджетного алерта у дохода и текстами.
export interface EntryDraft {
  mode: 'expense' | 'income';
  amount: number;
  label: string | null;
  note: string | null;
  rootId?: string;
  subId?: string | null;
  suggestion?: { categoryId: string; subcategoryId: string | null };
  accountId?: string;
  awaitingRate?: boolean;
}

// Черновик перевода. Какой шаг следующий — выводится из заполненности полей
// чистой функцией nextTransferStep (transfer-steps.ts), в сессии шаг не храним.
// toId: undefined — счёт-получатель ещё не выбран, null — «вне счетов».
export interface TransferDraft {
  mode: 'transfer';
  categoryId?: string;
  subcategoryId?: string | null;
  fromId?: string;
  fromName?: string;
  fromCurrency?: string;
  toId?: string | null;
  toName?: string | null;
  toCurrency?: string | null;
  amount?: number;
  rate?: number;
  toAmount?: number;
}

// /stats → «Свой диапазон»: ждём текст с двумя датами; income — был ли включён режим доходов.
export interface AwaitRangeState {
  mode: 'await_range';
  income: boolean;
}

// Фильтры списка операций (/history); подмножество ListTransactionsDto.
export interface HistoryFilters {
  type?: 'expense' | 'income' | 'transfer';
  categoryId?: string;
  categoryName?: string;
  accountId?: string;
  accountName?: string;
  from?: string;
  to?: string;
  q?: string;
}

// Список операций: фильтры и страница живут здесь (в callback — только номер страницы).
// picking — какой фильтр выбирается пикером категорий/счетов; awaiting — ждём текст.
export interface HistoryState {
  mode: 'history';
  filters: HistoryFilters;
  page: number;
  picking?: 'category' | 'account';
  awaiting?: 'query' | 'range';
}

// Карточка операции / редактирование поля. returnTo — вернуться в тот же список.
export interface EditState {
  mode: 'edit';
  txId: string;
  field?: 'amount' | 'date' | 'label' | 'note' | 'rate';
  rootId?: string; // выбранная корневая категория при смене категории
  accountId?: string; // выбранный валютный счёт, ждём курс
  returnTo?: { filters: HistoryFilters; page: number };
}

// /budget → «Задать лимит»: после выбора категории ждём сумму текстом.
export interface BudgetSetState {
  mode: 'budget_set';
  categoryId?: string;
  categoryName?: string;
}

export type Session =
  | EntryDraft
  | TransferDraft
  | AwaitRangeState
  | HistoryState
  | EditState
  | BudgetSetState;

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
