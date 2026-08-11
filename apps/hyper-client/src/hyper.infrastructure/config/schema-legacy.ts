/**
 * Zod schema for sidecar runtime configuration.
 *
 * Pure data — no side effects, no `process.env` reads, no `console.*` calls.
 * Loaded by `./load.ts`, which is the only file that touches `process.env`.
 */
import { z } from 'zod';

export const DEV_TOKEN = 'dev-only-token-replace-in-production-32chars';
export const PROD = process.env.NODE_ENV === 'production';

export const ConfigSchema = z.object({
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