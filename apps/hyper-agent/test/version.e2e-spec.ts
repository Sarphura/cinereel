/**
 * Ticket 10 — version.spec.ts.
 *
 * Asserts the `/v1/version` route is gated by the shared-secret
 * middleware and that the response body matches the value in
 * `apps/hyper-agent/package.json` at test time.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { createTestApp, authHeaders, type TestContext } from './helpers.js'

interface PackageShape {
  name: string
  version: string
}

function readHyperAgentPackageJson(): PackageShape {
  // Walk up from this test file to find apps/hyper-agent/package.json.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidate = path.resolve(here, '..', 'package.json')
  return JSON.parse(readFileSync(candidate, 'utf8')) as PackageShape
}

describe('hyper-agent /v1/version (NestJS + Express)', () => {
  let ctx: TestContext
  const pkg = readHyperAgentPackageJson()

  beforeAll(async () => {
    ctx = await createTestApp()
  })
  afterAll(async () => {
    await ctx.cleanup()
  })

  it('GET /v1/version returns 401 without token', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1/version')
    expect(res.status).toBe(401)
    expect(res.body.type).toBe('https://cinereel.dev/errors/missing-token')
  })

  it('GET /v1/version with token returns the package.json version', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/version')
      .set(authHeaders())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      name: pkg.name,
      version: pkg.version,
    })
  })
})
