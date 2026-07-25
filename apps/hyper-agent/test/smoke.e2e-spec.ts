/**
 * Smoke e2e — public routes + shared-secret auth round-trip.
 *
 * Uses the in-process TestSdk stub so the suite runs in <1s without
 * touching real hyperswarm / disk IO. Every route requires the
 * shared-secret token (ticket 09), including `/healthz`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createTestApp, authHeaders, bearerHeaders, type TestContext } from './helpers.js'

describe('hyper-agent smoke (NestJS + Express)', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })
  afterAll(async () => {
    await ctx.cleanup()
  })

  it('GET /healthz returns 200 with correct token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/healthz')
      .set(authHeaders())
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(typeof res.body.uptime).toBe('number')
  })

  it('GET /healthz returns 401 without token', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/healthz')
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/missing-token')
  })

  it('GET /healthz returns 401 with wrong token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/healthz')
      .set({ 'x-sidecar-token': 'wrong-token-abcdefghijklmnop' })
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/invalid-token')
  })

  it('GET /healthz accepts Authorization: Bearer <token>', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/healthz')
      .set(bearerHeaders())
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('POST /v1/auth/token is removed (no longer a route)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/token')
      .set(authHeaders())
      .send({ apiKey: 'a'.repeat(64) })
    // Nest returns 404 for un-registered routes (Express default).
    expect(res.status).toBe(404)
  })

  it('GET /v1/drives/:key/file (legacy read path) is removed in ticket 13', async () => {
    // Use a well-formed hex64 key + path so any 401/404 we see is the
    // route being gone, not an authn or authz check.
    const key = 'a'.repeat(64)
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/drives/${key}/file`)
      .query({ path: '/trailer.mp4' })
      .set(authHeaders())
    // Reads moved to /v1/files/:driveKey/* in ticket 11; the old route
    // is gone, so Nest's default 404 handler returns 404.
    expect(res.status).toBe(404)
  })

  it('GET /v1/identity returns 200 with correct token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/identity')
      .set(authHeaders())
    expect(res.status).toBe(200)
    expect(res.body.mainDriveKey).toMatch(/^[0-9a-f]{64}$/)
    expect(res.body.peerPublicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(typeof res.body.swarmPort).toBe('number')
    expect(typeof res.body.peerCount).toBe('number')
  })

  it('GET /v1/identity returns 401 without token', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1/identity')
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/missing-token')
  })

  it('GET /v1/identity returns 401 with wrong token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/identity')
      .set({ 'x-sidecar-token': 'wrong-token-abcdefghijklmnop' })
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/invalid-token')
  })

  it('GET /v1/drives returns 200 with correct token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/drives')
      .set(authHeaders())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /v1/drives returns 401 with wrong token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/drives')
      .set({ 'x-sidecar-token': 'wrong-token-abcdefghijklmnop' })
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/invalid-token')
  })

  it('POST /v1/drives creates a drive with correct token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/drives')
      .set(authHeaders())
      .send({ name: 'movies', type: 'metadata' })
    expect(res.status).toBe(201)
    expect(res.body.driveKey).toMatch(/^[0-9a-f]{64}$/)
    expect(res.body.name).toBe('movies')
    expect(res.body.type).toBe('metadata')
  })

  it('POST /v1/drives returns 401 without token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/drives')
      .send({ name: 'movies', type: 'metadata' })
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/missing-token')
  })

  it('POST /v1/drives returns 400 when body is missing required fields', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/drives')
      .set(authHeaders())
      .send({ name: 'movies' })
    expect(res.status).toBe(400)
  })
})
