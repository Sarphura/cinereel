/**
 * Smoke e2e — public routes + auth round-trip.
 *
 * Uses the in-process TestSdk stub so the suite runs in <1s without
 * touching real hyperswarm / disk IO.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createTestApp, authHeaders, bearerHeaders, type TestContext } from './helpers.js'

describe('sidecar smoke (NestJS + Express)', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })
  afterAll(async () => {
    await ctx.cleanup()
  })

  it('GET /healthz returns 200 without auth', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(typeof res.body.uptime).toBe('number')
  })

  it('POST /v1/auth/token returns 400 when apiKey is missing', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/token')
      .send({})
    expect(res.status).toBe(400)
  })

  it('POST /v1/auth/token returns JWT with valid API key', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/token')
      .send({ apiKey: 'a'.repeat(32) })
    expect(res.status).toBe(200)
    expect(res.body.token).toMatch(/^[^\s]+\.[^\s]+\.[^\s]+$/)
    expect(res.body.expiresIn).toBe(900)
    expect(res.body.tokenType).toBe('Bearer')
  })

  it('POST /v1/auth/token returns 401 with unknown API key', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/token')
      .send({ apiKey: 'this-is-not-a-registered-key-0000' })
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/invalid-token')
  })

  it('GET /v1/identity returns 200 with Bearer JWT', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/identity')
      .set(bearerHeaders())
    expect(res.status).toBe(200)
    expect(res.body.mainDriveKey).toMatch(/^[0-9a-f]{64}$/)
    expect(res.body.peerPublicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(typeof res.body.swarmPort).toBe('number')
    expect(typeof res.body.peerCount).toBe('number')
  })

  it('GET /v1/identity returns 401 without auth', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1/identity')
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/missing-token')
  })

  it('GET /v1/drives returns 200 with X-Sidecar-Token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/drives')
      .set(authHeaders())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /v1/drives returns 401 with wrong X-Sidecar-Token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/drives')
      .set({ 'x-sidecar-token': 'wrong-token-abcdefghijklmnop' })
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/invalid-token')
  })

  it('POST /v1/drives creates a drive with Bearer JWT', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/drives')
      .set(bearerHeaders())
      .send({ name: 'movies', type: 'metadata' })
    expect(res.status).toBe(201)
    expect(res.body.driveKey).toMatch(/^[0-9a-f]{64}$/)
    expect(res.body.name).toBe('movies')
    expect(res.body.type).toBe('metadata')
  })

  it('POST /v1/drives returns 400 when body is missing required fields', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/drives')
      .set(bearerHeaders())
      .send({ name: 'movies' })
    expect(res.status).toBe(400)
  })
})