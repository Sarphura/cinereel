import { z } from 'zod';

const DEV_TOKEN = 'dev-only-token-replace-in-production-32chars';
const PROD = process.env.NODE_ENV === 'production';

const ConfigSchema = z.object({
  port: z.coerce.number().int().positive().default(4321),
  host: z.string().default('127.0.0.1'),
  token: z
    .string()
    .min(16, 'SIDECAR_TOKEN must be at least 16 characters')
    .default(PROD ? '' : DEV_TOKEN),
  // Peer runners (e.g. `pnpm run dev:sidecar:peer`) should isolate state on disk;
  // SIDECAR_STORE_DIR lets a second instance point at a sibling store without
  // touching the main dev's data. The fallback is resolved in `loadConfig`
  // (not as a zod default) so tests can drive it via injected env.
  storeDir: z.string().optional(),
  swarmPort: z.coerce
    .number()
    .int()
    .min(0, 'SIDECAR_SWARM_PORT must be between 0 and 65535')
    .max(65535, 'SIDECAR_SWARM_PORT must be between 0 and 65535')
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
  // Optional override pointing at the env file the process was launched with;
  // purely informational (also stamped into logs so failures are reproducible).
  envFile: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema> & {
  storeDir: string;
  envFile: string | undefined;
};

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
  };
  const parsed = ConfigSchema.safeParse(mapped);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid sidecar config:\n${issues}`);
  }
  const cfg = parsed.data as Config;
  cfg.storeDir = env.SIDECAR_STORE_DIR ?? './.sidecar-store';

  if (!cfg.storeDir) {
    cfg.storeDir = env.SIDECAR_STORE_DIR ?? './.sidecar-store';
  }

  // Diagnostic: when the resolved store dir or port differs from defaults, log it
  // so multi-instance startups are debuggable. Pure stderr so it survives when
  // pino is redirected to a file.
  const peerish = cfg.port !== 4321 || cfg.storeDir !== './.sidecar-store';
  if (peerish || process.env.SIDECAR_DEBUG_CONFIG) {
    // eslint-disable-next-line no-console
    console.error(
      `[sidecar.config] envFile=${cfg.envFile ?? '(none)'} ` +
        `cwd=${process.cwd()} ` +
        `host=${cfg.host}:${cfg.port} ` +
        `storeDir=${cfg.storeDir} ` +
        `swarmPort=${cfg.swarmPort} ` +
        `token=${cfg.token === DEV_TOKEN ? 'dev-default' : 'custom(***)'}`,
    );
  }

  // Production refuses to boot with the dev placeholder.
  if (PROD && cfg.token === DEV_TOKEN) {
    throw new Error(
      'Invalid sidecar config:\n  - token: SIDECAR_TOKEN must be set in production',
    );
  }
  if (!PROD && cfg.token === DEV_TOKEN) {
    // eslint-disable-next-line no-console
    console.warn(
      '[sidecar] SIDECAR_TOKEN not set — using insecure development default. ' +
        'Set SIDECAR_TOKEN before exposing this process beyond loopback.',
    );
  } else if (!PROD && cfg.token.startsWith('dev-only')) {
    // Non-placeholder dev token (e.g. .env.peer uses a peer-specific value).
    // Print it so API clients (Apifox, curl, smoke tests) can copy it without
    // having to grep the env file.
    // eslint-disable-next-line no-console
    console.warn(
      `[sidecar] dev instance at ${cfg.host}:${cfg.port} expects ` +
        `X-Sidecar-Token: ${cfg.token}`,
    );
  }

  return cfg;
}
