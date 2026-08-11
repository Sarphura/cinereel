/**
 * Config layer — replaces the prior `src/config/{schema,load,index}.ts` triple.
 *
 * NestJS @nestjs/config is wired with `validate` = `ConfigSchema.safeParse`,
 * so any `ConfigService.get(...)` returns a strictly typed value derived
 * from the env. Side effects (dev-token warning, prod-with-dev-token refusal)
 * live in `validateOrThrow()` and run during module init.
 */
import { z } from 'zod'

export const DEV_TOKEN = 'dev-only-token-replace-in-production-32chars'
export const PROD = process.env.NODE_ENV === 'production'

export const ConfigSchema = z.object({
  port: z.coerce.number().int().positive().default(4321),
  host: z.string().default('127.0.0.1'),
  token: z
    .string()
    .min(16, 'SIDECAR_TOKEN must be at least 16 characters')
    .default(PROD ? '' : DEV_TOKEN),
  storeDir: z.string().default('./.sidecar-store'),
  swarmPort: z.coerce
    .number()
    .int()
    .min(0)
    .max(65535)
    .default(0),
  bootstrap: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        : undefined,
    ),
  logLevel: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  shutdownTimeoutMs: z.coerce.number().int().positive().default(30_000),
  envFile: z.string().optional(),
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Adapter for @nestjs/config's `validate` hook — runs once during
 * ConfigModule init. Returns the parsed config; throws on validation
 * failure.
 */
export function validateOrThrow(env: NodeJS.ProcessEnv = process.env): Config {
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
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid sidecar config:\n${issues}`)
  }
  const cfg = parsed.data
  // Production refuses to boot with the dev placeholder.
  if (PROD && cfg.token === DEV_TOKEN) {
    throw new Error(
      'Invalid sidecar config:\n  - token: SIDECAR_TOKEN must be set in production',
    )
  }
  // Dev-mode diagnostics. The HTTP shared-secret token is no longer
  // sourced from SIDECAR_TOKEN (see ticket 09); it lives in
  // <SIDECAR_STORE_DIR>/sidecar.token and is printed by main.ts at
  // startup. We still warn if the env asked for a value that won't be
  // honored, and we still gate production on a real token in case an
  // operator wires one in for a different reason (e.g. CI smoke tests).
  // eslint-disable-next-line no-console
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
