/**
 * Hyper Agent exit codes.
 *
 * Each failure mode the Application Server's spawn-watch loop cares
 * about gets a stable integer so the App Server can branch on it (see
 * apps/service/Infrastructure/HyperAgent/HyperAgentExitCodes.cs — wired
 * in by ticket 16). Every `process.exit(...)` call site in the Hyper
 * Agent MUST go through one of these named constants, never a bare
 * integer, so the table here stays the single source of truth.
 *
 * ADR 0017, ADR 0048, ADR 0055, ADR 0056 codify the policy. The full
 * table is mirrored in `docs/spec/hyper-agent.md` (Lifecycle → Exit
 * codes); if you change a number here, change the spec in the same
 * commit and call it out in the ADR that drives the change.
 */

/** Reserved: 0. The Hyper Agent exits 0 only on a clean shutdown (SIGTERM after app.close()). */
export const EXIT_OK = 0 as const

/** Reserved: 1. Generic fatal — the run-time error path that does not fit a documented failure mode. */
export const EXIT_GENERIC = 1 as const

/** The Hyper Agent tried to bind the loopback port but it was already in use (ADR 0010, ADR 0017). */
export const EXIT_PORT_IN_USE = 73 as const

/** Reserved. Reserved range for future-side failure modes that don't fit a higher-numbered code. */
export const EXIT_RESERVED_74 = 74 as const

/** Reserved. Reserved range for future-side failure modes that don't fit a higher-numbered code. */
export const EXIT_RESERVED_75 = 75 as const

/**
 * Version check failure. The Hyper Agent itself never produces this code;
 * the App Server propagates it after the Hyper Agent's `/v1/version` does
 * not match the App Server's expected version (ADR 0033). Listed here so
 * the App Server can find the constant in one place.
 */
export const EXIT_VERSION_MISMATCH = 76 as const

/** Corestore directory is missing or unwritable (ADR 0046). */
export const EXIT_CORESTORE_UNAVAILABLE = 77 as const

/**
 * Dependency-injection / NestJS wiring failure, or any other unrecoverable
 * NestJS-side error during boot (ADR 0044). Distinct from "the Hyper Agent
 * lost its Corestore mid-run"; that is `EXIT_CORESTORE_UNAVAILABLE`.
 */
export const EXIT_DI_FAILURE = 78 as const

/**
 * drive-index.json is malformed or otherwise unreadable during bootstrap.
 * The Hyper Agent refuses to silently recover (ADR 0045, ticket 07) and
 * exits with this code so an operator notices instead of finding drives
 * missing later.
 */
export const EXIT_DRIVE_INDEX_CORRUPT = 79 as const

/** The fixed 'main' Hyperdrive failed to open during bootstrap (ADR 0045, ADR 0048). */
export const EXIT_MAIN_DRIVE_MOUNT_FAILED = 80 as const

/**
 * The Application Server's `/healthz` poll exceeded the readiness budget
 * (ADR 0055). The Hyper Agent itself never produces this code; the App
 * Server sets it after the readiness watchdog fires.
 */
export const EXIT_READINESS_TIMEOUT = 81 as const

/**
 * Lookup helper: returns the human-readable trigger condition for an exit
 * code. Unknown codes map to the generic "unrecognised" string so a
 * log line is never empty.
 */
export function describeExitCode(code: number): string {
  switch (code) {
    case EXIT_OK:
      return 'clean shutdown (SIGTERM after app.close())'
    case EXIT_GENERIC:
      return 'generic fatal (uncaught error)'
    case EXIT_PORT_IN_USE:
      return 'loopback port already in use (SIDECAR_PORT)'
    case EXIT_RESERVED_74:
      return 'reserved'
    case EXIT_RESERVED_75:
      return 'reserved'
    case EXIT_VERSION_MISMATCH:
      return 'version mismatch (App Server propagates)'
    case EXIT_CORESTORE_UNAVAILABLE:
      return 'Corestore missing or unwritable'
    case EXIT_DI_FAILURE:
      return 'DI / NestJS wiring failure'
    case EXIT_DRIVE_INDEX_CORRUPT:
      return 'drive-index.json corrupt'
    case EXIT_MAIN_DRIVE_MOUNT_FAILED:
      return "main Hyperdrive failed to open"
    case EXIT_READINESS_TIMEOUT:
      return 'readiness timeout (App Server propagates)'
    default:
      return `unrecognised exit code ${code}`
  }
}
