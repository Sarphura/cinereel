/**
 * Sidecar config loader.
 *
 * Single point of side effects for configuration:
 *   - reads `process.env`
 *   - emits `console.warn` for dev-token / multi-instance diagnostics
 *   - throws on production-with-placeholder-token
 *
 * Use `./schema.ts` when you need the bare `Config` type.
 */
import { ConfigSchema, DEV_TOKEN, PROD, type Config } from './schema.js';

export { ConfigSchema, type Config, DEV_TOKEN } from './schema.js';

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