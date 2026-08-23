export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

function resolveErrorMessage(payload: Record<string, unknown>) {
  if (payload.errors && typeof payload.errors === 'object') {
    const messages = Object.values(payload.errors as Record<string, unknown>)
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .filter((value): value is string => typeof value === 'string');

    if (messages.length > 0) {
      return messages.join('; ');
    }
  }

  if (typeof payload.title === 'string') {
    return payload.detail && typeof payload.detail === 'string'
      ? `${payload.title}：${payload.detail}`
      : payload.title;
  }

  const message = typeof payload.message === 'string'
    ? payload.message
    : Array.isArray(payload.message)
      ? payload.message.join('; ')
      : undefined;

  return message ?? (typeof payload.error === 'string' ? payload.error : undefined);
}

export async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(resolveErrorMessage(payload) ?? '请求失败。');
  }

  return payload as T;
}
