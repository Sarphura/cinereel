import { describe, expect, it, vi } from 'vitest';
import { requestJson } from './api';

describe('requestJson', () => {
  it('发送 JSON body 时保留自定义 header 并补齐媒体类型', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await requestJson('/api/drives', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'web:test' },
      body: JSON.stringify({ name: '电影库', contentTypeId: 'cinereel.movie' }),
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Idempotency-Key')).toBe('web:test');
  });
});
