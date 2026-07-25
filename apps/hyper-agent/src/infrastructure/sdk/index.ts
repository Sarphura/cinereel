/**
 * Single import point for the official `hyper-sdk` package.
 *
 * Why this file exists: sidecar code outside `infrastructure/sdk/` should
 * never reach into `node_modules/hyper-sdk` directly — that's the boundary
 * the `scripts/check-sdk-boundary.sh` guard enforces. This module re-exports
 * the official SDK symbols and is the one place the raw package is
 * imported.
 *
 * Naming note: the npm package's `index.js` exports
 *   - `create` (factory function)
 *   - `SDK` (class / instance type)
 * as ES module named exports. We re-export them with the same names so
 * callers can `import { create, type SDK } from '../infrastructure/sdk/index.js'`.
 */
export { create } from 'hyper-sdk'
export type { SDK } from 'hyper-sdk'

// ── SDK shim ─────────────────────────────────────────────────────────────
// `sdk.ts` is now a re-export; nothing else lives here.