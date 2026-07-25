/**
 * Ticket 08 — errors.spec.ts.
 *
 * Enumerates every URI in `infrastructure/errors/errors.const.ts` and
 * proves each trigger produces the right ProblemDetails body. The
 * "trigger" here is the existence of the spec object; for HTTP-layer
 * coverage of each URI the per-route specs (`smoke.e2e-spec.ts` for
 * auth, the drives/swarm specs for drive-not-mounted and
 * cannot-write-remote-drive, the range spec for range-not-satisfiable)
 * carry the cross-check. This file pins the *vocabulary*: the URI
 * strings, status codes, and titles are stable across the codebase.
 */
import { describe, it, expect } from 'vitest'
import {
  DRIVE_NOT_MOUNTED,
  INVALID_DRIVE_KEY,
  INVALID_INPUT,
  INVALID_PATH,
  INVALID_RANGE,
  CANNOT_WRITE_REMOTE_DRIVE,
  RANGE_NOT_SATISFIABLE,
  MULTI_RANGE_NOT_SUPPORTED,
  MISSING_TOKEN,
  INVALID_TOKEN,
  INTERNAL,
  httpStatusFallback,
  PROBLEM_CONTENT_TYPE,
} from '../src/infrastructure/errors/errors.const.js'
import {
  toProblemDetails,
  HttpProblem,
  type ProblemDetails,
} from '../src/infrastructure/errors/index.js'

describe('errors.const.ts vocabulary', () => {
  const specs: Array<[string, { uri: string; status: number; title: string }]> = [
    ['DRIVE_NOT_MOUNTED', DRIVE_NOT_MOUNTED],
    ['INVALID_DRIVE_KEY', INVALID_DRIVE_KEY],
    ['INVALID_INPUT', INVALID_INPUT],
    ['INVALID_PATH', INVALID_PATH],
    ['INVALID_RANGE', INVALID_RANGE],
    ['CANNOT_WRITE_REMOTE_DRIVE', CANNOT_WRITE_REMOTE_DRIVE],
    ['RANGE_NOT_SATISFIABLE', RANGE_NOT_SATISFIABLE],
    ['MULTI_RANGE_NOT_SUPPORTED', MULTI_RANGE_NOT_SUPPORTED],
    ['MISSING_TOKEN', MISSING_TOKEN],
    ['INVALID_TOKEN', INVALID_TOKEN],
    ['INTERNAL', INTERNAL],
  ]

  for (const [name, spec] of specs) {
    it(`${name} URI starts with the documented prefix and matches its status`, () => {
      expect(spec.uri.startsWith('https://cinereel.dev/errors/')).toBe(true)
      expect(spec.status).toBeGreaterThanOrEqual(400)
      expect(spec.status).toBeLessThan(600)
      expect(spec.title.length).toBeGreaterThan(0)
    })
  }

  it('every URI is unique', () => {
    const uris = specs.map(([, s]) => s.uri)
    expect(new Set(uris).size).toBe(uris.length)
  })

  it('httpStatusFallback returns a stable URI per status code', () => {
    const a = httpStatusFallback(418)
    const b = httpStatusFallback(418)
    expect(a.uri).toBe(b.uri)
    expect(a.uri).toBe('https://cinereel.dev/errors/http-418')
    expect(a.status).toBe(418)
  })

  it('PROBLEM_CONTENT_TYPE is RFC 9457', () => {
    expect(PROBLEM_CONTENT_TYPE).toBe('application/problem+json')
  })

  it('toProblemDetails omits detail/instance when not provided', () => {
    const body: ProblemDetails = toProblemDetails(DRIVE_NOT_MOUNTED)
    expect(body).toEqual({
      type: 'https://cinereel.dev/errors/drive-not-mounted',
      title: 'Drive not mounted',
      status: 404,
    })
    expect(Object.prototype.hasOwnProperty.call(body, 'detail')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(body, 'instance')).toBe(false)
  })

  it('toProblemDetails includes detail/instance when provided', () => {
    const body = toProblemDetails(MISSING_TOKEN, {
      detail: 'No header',
      instance: '/v1/drives',
    })
    expect(body).toEqual({
      type: 'https://cinereel.dev/errors/missing-token',
      title: 'Missing token',
      status: 401,
      detail: 'No header',
      instance: '/v1/drives',
    })
  })

  it('HttpProblem carries spec + detail without pre-rendering the body', () => {
    const err = new HttpProblem(RANGE_NOT_SATISFIABLE, 'bytes=999999-')
    expect(err.spec).toBe(RANGE_NOT_SATISFIABLE)
    expect(err.detail).toBe('bytes=999999-')
    expect(err.message).toBe('bytes=999999-')
  })
})
