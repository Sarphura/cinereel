/**
 * Sidecar config loader (legacy entry point).
 *
 * Used by src/config-loader.ts for backward compatibility.
 */
import { ConfigSchema, DEV_TOKEN, PROD, type Config } from './env.schema.js'

export { ConfigSchema, type Config, DEV_TOKEN } from './env.schema.js'

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mapped = {
    port: env.SIDECAR_PORT,
    host: env.SIDECAR_HOST,
    token: env.SIDECAR_TOKEN,
    storeDir: env.SIDECAR_STORE_DIR,
    swarmPort: env.SIDECAR_SWARM_PORT,
    bootstrap: env.SIDECAR_BOOTSTRAP,
    logLevel: env.SIDECAR_LOG_LEVEL,
    shutdownTimeoutMs: env.SIDECAR_SHUTDOWN_TIMEOUT_MS,
    envFile: env.SIDECAR_ENV_FILE,
  }
  const parsed = ConfigSchema.safeParse(mapped)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i: any) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid sidecar config:\n${issues}`)
  }
  const cfg = parsed.data
  if (PROD && cfg.token === DEV_TOKEN) {
    throw new Error(
      'Invalid sidecar config:\n  - token: SIDECAR_TOKEN must be set in production',
    )
  }
  if (!PROD && cfg.token === DEV_TOKEN) {
    console.warn(
      '[sidecar] SIDECAR_TOKEN env is no longer used for HTTP auth — ' +
        'the shared secret is read from <SIDECAR_STORE_DIR>/sidecar.token. ' +
        'See the dev-mode startup banner for the actual X-Sidecar-Token value.',
    )
  } else if (!PROD && cfg.token.startsWith('dev-only')) {
    console.warn(
      `[sidecar] SIDECAR_TOKEN (${cfg.token}) is ignored for HTTP auth; ` +
        `set it to empty or remove it. The active token is at ` +
        `<SIDECAR_STORE_DIR>/sidecar.token.`,
    )
  }
  return cfg
}
