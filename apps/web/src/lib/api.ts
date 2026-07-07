export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers,
    ...init,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Nest 默认异常响应体使用 `message` 字段承载具体错误信息
    // （class-validator 校验失败时为字符串数组），`error` 通常只是状态短语。
    const message = typeof payload.message === 'string'
      ? payload.message
      : Array.isArray(payload.message)
        ? payload.message.join('; ')
        : undefined;
    throw new Error(message ?? payload.error ?? '请求失败。');
  }

  return payload as T;
}
