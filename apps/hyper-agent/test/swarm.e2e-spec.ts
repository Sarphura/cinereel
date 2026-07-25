/**
 * `/v1/swarm/peers` + `/v1/_test/peer` contract tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createTestApp, authHeaders, bearerHeaders, type TestContext } from './helpers.js'

const peerA = 'a'.repeat(64)
const peerB = 'b'.repeat(64)
const peerC = 'c'.repeat(64)

describe('sidecar /v1/swarm/peers (NestJS)', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })
  afterAll(async () => {
    await ctx.cleanup()
  })

  async function postPeer(hex: string) {
    return request(ctx.app.getHttpServer())
      .post('/v1/_test/peer')
      .set({ ...authHeaders(), 'content-type': 'application/json' })
      .send({ publicKey: hex })
  }
  async function deletePeer(hex: string) {
    return request(ctx.app.getHttpServer())
      .delete(`/v1/_test/peer/${hex}`)
      .set(authHeaders())
  }

  it('GET /v1/swarm/peers returns 401 without auth', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1/swarm/peers')
    expect(res.status).toBe(401)
  })

  it('Bearer JWT also grants access to /v1/swarm/peers', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/swarm/peers')
      .set(bearerHeaders())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('inject → list → identity.peerCount round-trip', async () => {
    const r = await postPeer(peerA)
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.peerCount).toBeGreaterThanOrEqual(1)

    const peers = await request(ctx.app.getHttpServer())
      .get('/v1/swarm/peers')
      .set(authHeaders())
    expect(peers.status).toBe(200)
    expect(peers.body.find((p: { publicKey: string }) => p.publicKey === peerA)).toBeDefined()

    const id = await request(ctx.app.getHttpServer())
      .get('/v1/identity')
      .set(authHeaders())
    expect(id.body.peerCount).toBe(r.body.peerCount)
  })

  it('injecting the same publicKey twice is idempotent', async () => {
    const before = await request(ctx.app.getHttpServer())
      .get('/v1/swarm/peers')
      .set(authHeaders())
    expect(before.body.filter((p: { publicKey: string }) => p.publicKey === peerA)).toHaveLength(1)
    const r = await postPeer(peerA)
    expect(r.status).toBe(200)
    const after = await request(ctx.app.getHttpServer())
      .get('/v1/swarm/peers')
      .set(authHeaders())
    expect(after.body.filter((p: { publicKey: string }) => p.publicKey === peerA)).toHaveLength(1)
  })

  it('multiple peers appear together', async () => {
    const r1 = await postPeer(peerB)
    const r2 = await postPeer(peerC)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)

    const peers = await request(ctx.app.getHttpServer())
      .get('/v1/swarm/peers')
      .set(authHeaders())
    const keys = (peers.body as Array<{ publicKey: string }>).map((p) => p.publicKey).sort()
    expect(keys).toContain(peerA)
    expect(keys).toContain(peerB)
    expect(keys).toContain(peerC)
  })

  it('DELETE /v1/_test/peer/:publicKey removes a peer', async () => {
    const r = await deletePeer(peerB)
    expect(r.status).toBe(200)
    const peers = await request(ctx.app.getHttpServer())
      .get('/v1/swarm/peers')
      .set(authHeaders())
    const list = peers.body as Array<{ publicKey: string }>
    expect(list.find((p) => p.publicKey === peerB)).toBeUndefined()
    expect(list.find((p) => p.publicKey === peerA)).toBeDefined()
    expect(list.find((p) => p.publicKey === peerC)).toBeDefined()
  })

  it('inject with malformed publicKey returns 400', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/_test/peer')
      .set({ ...authHeaders(), 'content-type': 'application/json' })
      .send({ publicKey: 'not-hex' })
    expect(res.status).toBe(400)
  })

  it('remove malformed path publicKey returns 400', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete('/v1/_test/peer/not-hex')
      .set(authHeaders())
    expect(res.status).toBe(400)
  })
})