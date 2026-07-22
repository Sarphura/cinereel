/**
 * config-loader — exports `loadConfig` so main.ts can read env
 * (host/port/storeDir/swarmPort/bootstrap/token) BEFORE Nest boots.
 *
 * The same logic is also wired through @nestjs/config's `validate` hook
 * (see core/config/env.schema.ts → validateOrThrow), so this loader
 * essentially duplicates that. We keep it here because:
 *   - loadApiKeys() needs the parsed token at startup, before Nest DI
 *     has wired anything
 *   - pre-Nest log diagnostics need host/port to be known
 *
 * The duplication is intentional — there is one Zod schema, two
 * entry points that resolve it.
 */
export { loadConfig } from './config/load.js'
export type { Config } from './core/config/env.schema.js'
