import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { create as createSdk } from '../src/infrastructure/sdk/index.js'
import { buildServer } from '../src/middlewares/index.js'
import { loadApiKeys, getSigningSecret } from '../src/auth/keys.js'
import { signJwt } from '../src/auth/jwt.js'
import type {
  DriveDescriptor,
} from '../src/infrastructure/index.js'
import { bootstrap } from '../src/bootstrap/index.js'
import type { Services } from '../src/bootstrap/index.js'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/** Deterministic 32-byte test API key (registered as legacy key in tests). */
const TEST_API_KEY = 'a'.repeat(32)

/** Build a valid JWT signed with the test API key. */
function makeTestJwt(): string {
  const secret = getSigningSecret('__legacy__')!
  return signJwt({ sub: '__legacy__' }, secret)
}

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

describe('sidecar smoke', () => {
  let app: FastifyInstance | null = null
  let baseUrl: string | null = null
  let services: Services | null = null
  let sdk: Awaited<ReturnType<typeof createSdk>> | null = null
  let tmpStoreDir: string | null = null

  beforeAll(async () => {
    process.env.SIDECAR_TOKEN = TEST_API_KEY

    tmpStoreDir = mkdtempSync(path.join(os.tmpdir(), 'cinereel-smoke-'))

    const cfg = testConfig(tmpStoreDir)
    loadApiKeys(cfg)

    services = await bootstrap(cfg)
    // bootstrap owns the SDK; reuse it for the test-routes path.
    sdk = services.sdk

    app = await buildServer(cfg, services, sdk)
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

  // ── Public routes ──────────────────────────────────────────────────────

  it('GET /healthz returns 200 without auth', async () => {
    const res = await fetch(`${baseUrl}/healthz`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; uptime: number }
    expect(body.status).toBe('ok')
  })

  it('POST /v1/auth/token returns 400 when apiKey is missing', async () => {
    const res = await fetch(`${baseUrl}/v1/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('POST /v1/auth/token returns JWT with valid API key', async () => {
    const res = await fetch(`${baseUrl}/v1/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: TEST_API_KEY }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string; expiresIn: number; tokenType: string }
    expect(body.token).toMatch(/^[^\s]+\.[^\s]+\.[^\s]+$/)
    expect(body.expiresIn).toBe(900)
    expect(body.tokenType).toBe('Bearer')
  })

  it('POST /v1/auth/token returns 401 with unknown API key', async () => {
    const res = await fetch(`${baseUrl}/v1/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'this-is-not-a-registered-key-0000' }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  // ── Authenticated routes — JWT ─────────────────────────────────────────

  it('GET /v1/identity returns 200 with valid Bearer JWT', async () => {
    const jwt = makeTestJwt()
    const res = await fetch(`${baseUrl}/v1/identity`, {
      headers: { authorization: `Bearer ${jwt}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      mainDriveKey: string
      peerPublicKey: string
      swarmPort: number
      peerCount: number
    }
    expect(body.mainDriveKey).toMatch(/^[0-9a-f]{64}$/)
    expect(body.peerPublicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(typeof body.swarmPort).toBe('number')
    expect(typeof body.peerCount).toBe('number')
  })

  it('GET /v1/identity returns 401 with expired/invalid JWT', async () => {
    const res = await fetch(`${baseUrl}/v1/identity`, {
      headers: {
        authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJfX2xlZ2FjeV9fIiwiaWF0IjoxNjAsImV4cCI6MTYwfQ.invalid',
      },
    })
    expect(res.status).toBe(401)
  })

  it('GET /v1/identity returns 401 with no credentials', async () => {
    const res = await fetch(`${baseUrl}/v1/identity`)
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  // ── Authenticated routes — legacy X-Sidecar-Token (dev mode) ───────────

  it('GET /v1/drives returns 200 with X-Sidecar-Token (dev fallback)', async () => {
    const res = await fetch(`${baseUrl}/v1/drives`, {
      headers: { 'x-sidecar-token': TEST_API_KEY },
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  it('GET /v1/drives returns 401 with wrong X-Sidecar-Token', async () => {
    const res = await fetch(`${baseUrl}/v1/drives`, {
      headers: { 'x-sidecar-token': 'wrong-token-abcdefghijklmnop' },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string; details?: { hint?: string } } }
    expect(body.error.code).toBe('UNAUTHENTICATED')
    expect(body.error.details?.hint).toMatch(/peer/i)
  })

  it('POST /v1/drives creates a drive with Bearer JWT', async () => {
    const jwt = makeTestJwt()
    const res = await fetch(`${baseUrl}/v1/drives`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'movies', type: 'metadata' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as DriveDescriptor
    expect(body.driveKey).toMatch(/^[0-9a-f]{64}$/)
    expect(body.name).toBe('movies')
    expect(body.type).toBe('metadata')
  })

  it('POST /v1/drives returns 400 when body is missing required fields', async () => {
    const jwt = makeTestJwt()
    const res = await fetch(`${baseUrl}/v1/drives`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'movies' }),
    })
    expect(res.status).toBe(400)
  })
})