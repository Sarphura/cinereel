/**
 * Shared test fixtures for NestJS e2e tests.
 *
 * Provides `createTestApp()` that:
 *   1. Sets `SHARED_TOKEN` to a deterministic test value (overrides
 *      the file-system loader used in `main.ts`)
 *   2. Configures ConfigService with a tmp storeDir (so the SDK
 *      doesn't trash the dev's .sidecar-store)
 *   3. Replaces the SDK provider with `TestSdk` — production hyper-sdk
 *      requires real IO and is slow in tests
 *   4. Creates a NestApplication (no actual port binding)
 *   5. Initialises it (Nest startup)
 *
 * Ticket 09: the AuthMiddleware now expects a shared-secret token via
 * DI. The constant is injected through `SecurityModule.forRoot(token)`
 * in `AppModule.forRoot(token)`. Tests call this with the deterministic
 * `TEST_API_KEY` below and use `authHeaders()` / `bearerHeaders()` to
 * present it to the middleware.
 *
 * All e2e suites should use this to avoid booting the real SDK.
 */
import { Test, type TestingModule } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { SDK, HyperdriveLike } from '../src/infrastructure/index.js'
import { SDK_TOKEN } from '../src/core/sdk/sdk.module.js'
import { AppModule } from '../src/app.module.js'
import { HttpExceptionFilter } from '../src/core/common/filters/http-exception.filter.js'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import express from 'express'

/** Stable test token. 32 chars minimum, matches the 64-hex format produced by `loadOrMintSharedToken` (truncated for readability). */
export const TEST_API_KEY = 'a'.repeat(64)

export function authHeaders(): Record<string, string> {
  return { 'x-sidecar-token': TEST_API_KEY }
}

export function bearerHeaders(): Record<string, string> {
  return { authorization: `Bearer ${TEST_API_KEY}` }
}

/**
 * Test SDK — keeps an in-memory drive map so FileService / DriveService
 * tests can run without real hyperswarm IO. Note: this is a SHAPE stub,
 * not a behaviour-accurate Hyperdrive. For tests that need real
 * storage, override the provider with the real hyper-sdk.
 */
export class TestSdk {
  publicKey: Buffer = Buffer.alloc(32, 1)
  connections: Set<{ remotePublicKey: Buffer; on: () => unknown }> = new Set()
  swarm: { dht?: { address: () => { port: number } } } = { dht: { address: () => ({ port: 0 }) } }
  private drives = new Map<string, HyperdriveLike>()

  join = () => ({ flushed: async () => undefined } as unknown as { flushed(): Promise<void> })
  close = async () => undefined
  async getDrive(namespace: string): Promise<HyperdriveLike> {
    let d = this.drives.get(namespace)
    if (!d) {
      d = makeTestDrive(namespace)
      this.drives.set(namespace, d)
    }
    return d
  }
}

function makeTestDrive(seed: string): HyperdriveLike {
  // Stable 32-byte "public key" derived from the namespace string.
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const key = Buffer.alloc(32, h)
  return {
    key,
    core: { discoveryKey: Buffer.alloc(32, h ^ 0xdeadbeef) },
    ready: async () => undefined,
    close: async () => undefined,
    put: async () => undefined,
    get: async () => null,
    entry: async () => null,
    exists: async () => false,
    del: async () => undefined,
    clear: async () => ({ blocks: 0 }),
    symlink: async () => undefined,
    createReadStream: () => {
      throw new Error('not supported in unit test')
    },
    createWriteStream: () => {
      throw new Error('not supported in unit test')
    },
    async *readdir(): AsyncIterable<string> {},
    stat: async () => null,
  }
}

export interface TestContext {
  app: INestApplication
  moduleRef: TestingModule
  tmpDir: string
  cleanup: () => Promise<void>
}

export async function createTestApp(): Promise<TestContext> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cinereel-nest-'))

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(TEST_API_KEY)],
  })
    .overrideProvider(SDK_TOKEN)
    .useValue(new TestSdk() as unknown as SDK)
    .compile()

  const app = moduleRef.createNestApplication({ logger: ['error', 'warn', 'debug'] })
  // Mirror main.ts: register the RFC 9457 ProblemDetails filter
  // and the body parsers so supertest sees the same wire shape as a
  // production request.
  app.useGlobalFilters(new HttpExceptionFilter())
  app.use(express.json({ limit: '1mb' }))
  await app.init()

  return {
    app,
    moduleRef,
    tmpDir,
    cleanup: async () => {
      await app.close()
      rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}
