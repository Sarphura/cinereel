/**
 * Re-export entry for `./config/`.
 *
 * Sidecar imports `from '../config.js'` — this barrel keeps that working
 * while the implementation lives in two files (schema + load).
 */
export { loadConfig } from './load.js';
export type { Config } from './schema.js';
export { ConfigSchema, DEV_TOKEN } from './schema.js';