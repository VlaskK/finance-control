// Протокол callback_data инлайн-кнопок. Telegram ограничивает payload 64 байтами,
// поэтому все данные — короткие префиксы + максимум один UUID; второй объект
// (например, транзакция при выборе категории в редактировании) живёт в сессии.

// Пространства имён. Дженерики (confirm/pick/cancel/category/subcategory/account)
// переиспользуются всеми диалогами — их смысл определяется session.mode.
export const CB = {
  confirm: 'g', // подтвердить предложение (категорию, сводку перевода...)
  pickFull: 'pick', // отказаться от предложения, показать полный выбор
  cancel: 'x', // отменить текущий диалог
  category: 'c', // c:<uuid> — корневая категория
  subcategory: 's', // s:<uuid> | s:- (без подкатегории)
  account: 'a', // a:<uuid> — счёт
  noop: '-', // кнопка-индикатор, ничего не делает («стр. 2/5»)
} as const;

const MAX_CALLBACK_BYTES = 64;

// Собирает callback_data из сегментов; бросает при превышении лимита Telegram,
// чтобы ошибка всплыла в юнит-тестах клавиатур, а не молчаливым отказом кнопки в проде.
export function cb(...parts: Array<string | number>): string {
  const data = parts.join(':');
  if (Buffer.byteLength(data, 'utf8') > MAX_CALLBACK_BYTES) {
    throw new Error(`callback_data длиннее ${MAX_CALLBACK_BYTES} байт: ${data}`);
  }
  return data;
}

// Разбирает callback_data на namespace (первый сегмент) и аргументы.
// UUID не содержат «:», поэтому split безопасен.
export function parseCb(data: string): { ns: string; args: string[] } {
  const [ns = '', ...args] = data.split(':');
  return { ns, args };
}
