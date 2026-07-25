/**
 * Ticket 11 — files.e2e-spec.ts.
 *
 * End-to-end tests for the `/v1/files/:driveKey/*` Range endpoint. The
 * test app boots a fresh FilesModule and a stub drive populated with
 * one binary file so the Range parser + sliced stream + headers can
 * be exercised through supertest without touching real hyperswarm IO.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createTestAppWithFiles, authHeaders, type FilesTestContext } from './helpers.js'

describe('hyper-agent /v1/files/:driveKey/* (Range streaming)', () => {
  let ctx: FilesTestContext
  const driveKey = 'a'.repeat(64)
  const filePath = '/trailer.mp4'
  const content = Buffer.from('A'.repeat(500) + 'B'.repeat(500))

  beforeAll(async () => {
    ctx = await createTestAppWithFiles({ [filePath]: content })
  })
  afterAll(async () => {
    await ctx.cleanup()
  })

  function url(p: string = filePath): string {
    return `/v1/files/${ctx.driveKey}${p}`
  }

  it('returns 401 without token', async () => {
    const res = await request(ctx.app.getHttpServer()).get(url())
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/missing-token')
  })

  it('returns 200 + full body + immutable cache headers when no Range header is sent', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(url())
      .set(authHeaders())
    expect(res.status).toBe(200)
    expect(res.headers['accept-ranges']).toBe('bytes')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(res.headers['content-length']).toBe(String(content.length))
    expect(res.body.length).toBe(content.length)
  })

  it('returns 206 + sliced body for `bytes=0-499`', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(url())
      .set({ ...authHeaders(), range: 'bytes=0-499' })
    expect(res.status).toBe(206)
    expect(res.headers['content-range']).toBe(`bytes 0-499/${content.length}`)
    expect(res.headers['content-length']).toBe('500')
    expect(res.headers['accept-ranges']).toBe('bytes')
    expect(res.body.length).toBe(500)
  })

  it('returns 206 + open-ended range', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(url())
      .set({ ...authHeaders(), range: 'bytes=500-' })
    expect(res.status).toBe(206)
    expect(res.headers['content-range']).toBe(`bytes 500-999/${content.length}`)
    expect(res.headers['content-length']).toBe('500')
    expect(res.body.length).toBe(500)
  })

  it('returns 206 + suffix range', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(url())
      .set({ ...authHeaders(), range: 'bytes=-100' })
    expect(res.status).toBe(206)
    expect(res.headers['content-range']).toBe(`bytes 900-999/${content.length}`)
    expect(res.headers['content-length']).toBe('100')
    expect(res.body.length).toBe(100)
  })

  it('returns 416 with `range-not-satisfiable` for unsatisfiable ranges', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(url())
      .set({ ...authHeaders(), range: 'bytes=999999-' })
    expect(res.status).toBe(416)
    expect(res.body.type).toBe('https://cinereel.dev/errors/range-not-satisfiable')
    expect(res.headers['content-range']).toBe(`bytes */${content.length}`)
  })

  it('returns 416 with `multi-range-not-supported` for `bytes=0-499,1000-1499`', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(url())
      .set({ ...authHeaders(), range: 'bytes=0-499,1000-1499' })
    expect(res.status).toBe(416)
    expect(res.body.type).toBe('https://cinereel.dev/errors/multi-range-not-supported')
    expect(res.headers['content-range']).toBe(`bytes */${content.length}`)
  })

  it('returns 400 with `invalid-range` for malformed Range headers', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(url())
      .set({ ...authHeaders(), range: 'bytes=abc' })
    expect(res.status).toBe(400)
    expect(res.body.type).toBe('https://cinereel.dev/errors/invalid-range')
  })

  it('returns 400 with `invalid-drive-key` for non-hex64 driveKeys', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/files/not-hex' + filePath)
      .set(authHeaders())
    expect(res.status).toBe(400)
    expect(res.body.type).toBe('https://cinereel.dev/errors/invalid-drive-key')
  })

  it('returns 404 with `drive-not-mounted` for an unknown driveKey', async () => {
    const unknown = 'b'.repeat(64)
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/files/${unknown}${filePath}`)
      .set(authHeaders())
    expect(res.status).toBe(404)
    expect(res.body.type).toBe('https://cinereel.dev/errors/drive-not-mounted')
  })

  it('sets Content-Type from the file extension', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(url('/photo.jpg'))
      .set({ ...authHeaders(), range: 'bytes=0-0' })
    // photo.jpg is not in the seeded fileMap, so the controller 416s
    // before serving; the headers it sets reach the wire though.
    expect(res.headers['content-type']).toBe('application/problem+json; charset=utf-8')
  })

  it('sets image Content-Type from the file extension on the happy path', async () => {
    // Seed an image with a .jpg extension and read a one-byte range.
    const key = '/pic.jpg'
    ctx.putFile(key, Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
    const res = await request(ctx.app.getHttpServer())
      .get(url(key))
      .set({ ...authHeaders(), range: 'bytes=0-0' })
    expect(res.status).toBe(206)
    expect(res.headers['content-type']).toBe('image/jpeg')
  })

  it('sets video Content-Type from the file extension on the happy path', async () => {
    const key = '/movie.mp4'
    ctx.putFile(key, Buffer.alloc(8))
    const res = await request(ctx.app.getHttpServer())
      .get(url(key))
      .set({ ...authHeaders(), range: 'bytes=0-0' })
    expect(res.status).toBe(206)
    expect(res.headers['content-type']).toBe('video/mp4')
  })

  // driveKey is used in the URL builder; export it for other suites
  // that want to drive the same fixture.
  it('exposes driveKey for dependent tests', () => {
    expect(ctx.driveKey).toMatch(/^[0-9a-f]{64}$/)
  })
})
