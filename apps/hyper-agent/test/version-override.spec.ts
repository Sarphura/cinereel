/**
 * Ticket 10 — version-override.spec.ts.
 *
 * Pins the env-override path used by the integration smoke (ticket 18)
 * to pin a specific version on each side without rebuilding package.json.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VersionController } from '../src/feature/version/controller.js'

describe('VersionController env override', () => {
  const originalVersion = process.env.HYPER_AGENT_VERSION
  const originalName = process.env.HYPER_AGENT_NAME

  beforeEach(() => {
    delete process.env.HYPER_AGENT_VERSION
    delete process.env.HYPER_AGENT_NAME
  })
  afterEach(() => {
    if (originalVersion === undefined) delete process.env.HYPER_AGENT_VERSION
    else process.env.HYPER_AGENT_VERSION = originalVersion
    if (originalName === undefined) delete process.env.HYPER_AGENT_NAME
    else process.env.HYPER_AGENT_NAME = originalName
  })

  it('returns the override version when HYPER_AGENT_VERSION is set', () => {
    process.env.HYPER_AGENT_VERSION = '9.9.9-test'
    process.env.HYPER_AGENT_NAME = 'hyper-agent-stub'
    const ctl = new VersionController()
    expect(ctl.version()).toEqual({
      name: 'hyper-agent-stub',
      version: '9.9.9-test',
    })
  })

  it('falls back to package.json name when only version is overridden', () => {
    process.env.HYPER_AGENT_VERSION = '1.2.3'
    const ctl = new VersionController()
    // name falls back to on-disk package.json (or 'hyper-agent' default)
    expect(ctl.version().version).toBe('1.2.3')
    expect(typeof ctl.version().name).toBe('string')
    expect(ctl.version().name.length).toBeGreaterThan(0)
  })

  it('falls back to package.json version when no override is set', () => {
    const ctl = new VersionController()
    const body = ctl.version()
    expect(body.name).toMatch(/hyper-agent|cinereel/)
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
