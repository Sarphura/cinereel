import { describe, it, expect } from 'vitest'
import {
  EXIT_OK,
  EXIT_PORT_IN_USE,
  EXIT_RESERVED_74,
  EXIT_RESERVED_75,
  EXIT_VERSION_MISMATCH,
  EXIT_CORESTORE_UNAVAILABLE,
  EXIT_DI_FAILURE,
  EXIT_DRIVE_INDEX_CORRUPT,
  EXIT_MAIN_DRIVE_MOUNT_FAILED,
  EXIT_READINESS_TIMEOUT,
  describeExitCode,
} from '../src/infrastructure/exit-codes.js'

/**
 * Hyper Agent exit-code constants (ticket 05).
 *
 * The contract here is the *number* — the Application Server's
 * spawn-watch loop branches on these integers (wired up in ticket 16).
 * If a number changes, both the .NET App Server and the Hyper Agent's
 * own `process.exit()` call sites must move together.
 */
describe('hyper-agent exit codes', () => {
  it('every documented code has the spec-mandated integer', () => {
    expect(EXIT_OK).toBe(0)
    expect(EXIT_PORT_IN_USE).toBe(73)
    expect(EXIT_RESERVED_74).toBe(74)
    expect(EXIT_RESERVED_75).toBe(75)
    expect(EXIT_VERSION_MISMATCH).toBe(76)
    expect(EXIT_CORESTORE_UNAVAILABLE).toBe(77)
    expect(EXIT_DI_FAILURE).toBe(78)
    expect(EXIT_DRIVE_INDEX_CORRUPT).toBe(79)
    expect(EXIT_MAIN_DRIVE_MOUNT_FAILED).toBe(80)
    expect(EXIT_READINESS_TIMEOUT).toBe(81)
  })

  it('describeExitCode returns a non-empty string for every documented code', () => {
    for (const code of [
      EXIT_OK,
      EXIT_PORT_IN_USE,
      EXIT_RESERVED_74,
      EXIT_RESERVED_75,
      EXIT_VERSION_MISMATCH,
      EXIT_CORESTORE_UNAVAILABLE,
      EXIT_DI_FAILURE,
      EXIT_DRIVE_INDEX_CORRUPT,
      EXIT_MAIN_DRIVE_MOUNT_FAILED,
      EXIT_READINESS_TIMEOUT,
    ]) {
      expect(describeExitCode(code).length).toBeGreaterThan(0)
    }
  })

  it('describeExitCode on an unknown code returns an unrecognised marker (no false positives)', () => {
    const msg = describeExitCode(255)
    expect(msg.toLowerCase()).toContain('unrecognised')
  })
})
