/**
 * `/v1/swarm/peers` HTTP contract tests.
 *
 * Hyperswarm P2P requires real DHT routing and hole-punching; on a
 * loopback CI box with no public IP that is fundamentally not
 * reproducible. We instead drive synthetic connections through
 * `/v1/_test/peer` over an in-process Fastify instance to verify the
 * **wrapper** that maps `sdk.connections` → `GET /v1/swarm/peers` does
 * the right thing.
 *
 * Coverage:
 *   - peers list reflects injected connections
 *   - peerCount in /v1/identity stays consistent
 *   - auth on /v1/swarm/peers works (401 without/wrong token, 200 with dev token)
 *   - inject is idempotent (duplicate publicKey adds only once)
 *   - remove is symmetric
 *   - invalid publicKey surfaces 400
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { create as createSdk } from '../src/infrastructure/sdk/index.js'
import { buildServer } from '../src/middlewares/index.js'
import { loadApiKeys, getSigningSecret } from '../src/auth/keys.js'
import { signJwt } from '../src/auth/jwt.js'
import type { PeerInfo } from '../src/infrastructure/index.js'
import { bootstrap } from '../src/bootstrap/index.js'
import type { Services } from '../src/bootstrap/index.js'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TEST_API_KEY = 'a'.repeat(32)

function testConfig(storeDir: string) {
  return {
    port: 0,
    host: '127.0.0.1',
    token: TEST_API_KEY,
    storeDir,
    swarmPort: 0,
    bootstrap: undefined,
    logLevel: 'error' as const,
    shutdownTimeoutMs: 5_000,
    envFile: undefined as string | undefined,
  }
}

const peerA = 'a'.repeat(64)
const peerB = 'b'.repeat(64)
const peerC = 'c'.repeat(64)

describe('sidecar /v1/swarm/peers', () => {
  let app: FastifyInstance | null = null
  let baseUrl: string | null = null
  let services: Services | null = null
  let sdk: Awaited<ReturnType<typeof createSdk>> | null = null
  let tmpStoreDir: string | null = null

  beforeAll(async () => {
    process.env.SIDECAR_TOKEN = TEST_API_KEY
    tmpStoreDir = mkdtempSync(path.join(os.tmpdir(), 'cinereel-peer-'))
    const cfg = testConfig(tmpStoreDir)
    loadApiKeys(cfg)

    services = await bootstrap(cfg)
    sdk = services.sdk

    app = await buildServer(cfg, services, sdk, { testRoutes: true })
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    baseUrl = address
  })

  afterAll(async () => {
    if (app) await app.close()
    app = null
    baseUrl = null
    if (services) await services.sdk.close().catch(() => undefined)
    services = null
    sdk = null
    if (tmpStoreDir) rmSync(tmpStoreDir, { recursive: true, force: true })
    tmpStoreDir = null
  })

  function authHeaders() {
    return { 'x-sidecar-token': TEST_API_KEY } as Record<string, string>
  }

  async function postPeer(hex: string): Promise<{ status: number; body: { ok: boolean; peerCount: number } }> {
    const res = await fetch(`${baseUrl}/v1/_test/peer`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ publicKey: hex }),
    })
    return { status: res.status, body: (await res.json()) as { ok: boolean; peerCount: number } }
  }

  async function deletePeer(hex: string): Promise<{ status: number; body: { ok: boolean; peerCount: number } }> {
    const res = await fetch(`${baseUrl}/v1/_test/peer/${hex}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return { status: res.status, body: (await res.json()) as { ok: boolean; peerCount: number } }
  }

  it('GET /v1/swarm/peers returns 401 without auth', async () => {
    const res = await fetch(`${baseUrl}/v1/swarm/peers`)
    expect(res.status).toBe(401)
  })

  it('GET /v1/swarm/peers returns 401 with wrong X-Sidecar-Token', async () => {
    const res = await fetch(`${baseUrl}/v1/swarm/peers`, {
      headers: { 'x-sidecar-token': 'wrong-token-padded-to-min-length' },
    })
    expect(res.status).toBe(401)
  })

  it('Bearer JWT also grants access to /v1/swarm/peers', async () => {
    const secret = getSigningSecret('__legacy__')!
    const jwt = signJwt({ sub: '__legacy__' }, secret)
    const res = await fetch(`${baseUrl}/v1/swarm/peers`, {
      headers: { authorization: `Bearer ${jwt}` },
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  it('POST /v1/_test/peer is reachable and bumps peerCount in /v1/identity', async () => {
    const r = await postPeer(peerA)
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.peerCount).toBeGreaterThanOrEqual(1)

    const id = (await (await fetch(`${baseUrl}/v1/identity`, { headers: authHeaders() })).json()) as { peerCount: number }
    expect(id.peerCount).toBe(r.body.peerCount)
  })

  it('GET /v1/swarm/peers surfaces injected peer with hex publicKey + ISO connectedAt', async () => {
    const res = await fetch(`${baseUrl}/v1/swarm/peers`, { headers: authHeaders() })
    expect(res.status).toBe(200)
    const peers = (await res.json()) as PeerInfo[]
    const found = peers.find((p) => p.publicKey === peerA)
    expect(found, `peerA (${peerA}) not in ${JSON.stringify(peers.map((p) => p.publicKey))}`).toBeDefined()
    expect(found!.publicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(Number.isNaN(Date.parse(found!.connectedAt))).toBe(false)
  })

  it('connectedAt is stable across calls', async () => {
    const headers = authHeaders()
    const first = ((await (await fetch(`${baseUrl}/v1/swarm/peers`, { headers })).json()) as PeerInfo[])
      .find((p) => p.publicKey === peerA)!.connectedAt
    await new Promise((r) => setTimeout(r, 50))
    const second = ((await (await fetch(`${baseUrl}/v1/swarm/peers`, { headers })).json()) as PeerInfo[])
      .find((p) => p.publicKey === peerA)!.connectedAt
    expect(second).toBe(first)
  })

  it('injecting the same publicKey twice is idempotent', async () => {
    const before = ((await (await fetch(`${baseUrl}/v1/swarm/peers`, { headers: authHeaders() })).json()) as PeerInfo[])
      .filter((p) => p.publicKey === peerA).length
    expect(before).toBe(1)
    const r = await postPeer(peerA)
    expect(r.status).toBe(200)
    const after = ((await (await fetch(`${baseUrl}/v1/swarm/peers`, { headers: authHeaders() })).json()) as PeerInfo[])
      .filter((p) => p.publicKey === peerA).length
    expect(after).toBe(1)
  })

  it('multiple peers appear together; identity.peerCount reflects total', async () => {
    const r1 = await postPeer(peerB)
    const r2 = await postPeer(peerC)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(r2.body.peerCount).toBeGreaterThan(r1.body.peerCount)

    const peers = (await (await fetch(`${baseUrl}/v1/swarm/peers`, { headers: authHeaders() })).json()) as PeerInfo[]
    const keys = peers.map((p) => p.publicKey).sort()
    expect(keys).toContain(peerA)
    expect(keys).toContain(peerB)
    expect(keys).toContain(peerC)

    const id = (await (await fetch(`${baseUrl}/v1/identity`, { headers: authHeaders() })).json()) as { peerCount: number }
    expect(id.peerCount).toBe(peers.length)
  })

  it('DELETE /v1/_test/peer/:publicKey removes a peer', async () => {
    const r = await deletePeer(peerB)
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    const peers = (await (await fetch(`${baseUrl}/v1/swarm/peers`, { headers: authHeaders() })).json()) as PeerInfo[]
    expect(peers.find((p) => p.publicKey === peerB)).toBeUndefined()
    expect(peers.find((p) => p.publicKey === peerA)).toBeDefined()
    expect(peers.find((p) => p.publicKey === peerC)).toBeDefined()
  })

  it('DELETE for an unknown peer is a no-op (idempotent)', async () => {
    const r = await deletePeer('0'.repeat(64))
    expect(r.status).toBe(200)
  })

  it('inject with malformed publicKey returns 400 (schema rejects)', async () => {
    const res = await fetch(`${baseUrl}/v1/_test/peer`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ publicKey: 'not-hex' }),
    })
    expect(res.status).toBe(400)
  })

  it('remove malformed path publicKey returns 400 (schema rejects)', async () => {
    const res = await fetch(`${baseUrl}/v1/_test/peer/not-hex`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    expect(res.status).toBe(400)
  })
})