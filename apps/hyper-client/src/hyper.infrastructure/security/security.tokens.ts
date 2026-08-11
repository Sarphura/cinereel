/**
 * Security tokens — DI handles for the shared-secret auth layer.
 *
 * `SHARED_TOKEN` is the in-process constant the AuthMiddleware compares
 * every request against. In production it is populated at startup by
 * `loadOrMintSharedToken(<CINEREEL_DATA_DIR>)/sidecar.token`; tests
 * override it with a deterministic value via `Test.createTestingModule`.
 */
export const SHARED_TOKEN = Symbol.for('cinereel.hyper-agent.SHARED_TOKEN')

/** Branded alias — keeps the constructor signature self-documenting. */
export type SharedTokenPort = string
