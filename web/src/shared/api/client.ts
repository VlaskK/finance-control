// REST-клиент (§8.7). Ошибки бэка приходят как { message, fieldErrors } (NFR-U2).

// По умолчанию ходим в API по IPv4-loopback, а не по имени localhost: под VPN
// DNS для localhost может ломаться, и обращение по 127.0.0.1 минует резолвинг.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | undefined>;

function qs(params?: Query): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Запустите бэкенд (docker compose up) и обновите страницу', 0);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : 'Не удалось выполнить запрос — попробуйте ещё раз';
    const fieldErrors =
      typeof data === 'object' && data !== null && 'fieldErrors' in data
        ? ((data as { fieldErrors: Record<string, string> }).fieldErrors ?? {})
        : {};
    throw new ApiError(message, res.status, fieldErrors);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
