/**
 * API key registry loaded from environment variables.
 *
 * Supports three modes:
 *   1. SIDECAR_API_KEYS  — comma-separated "kid:secret" pairs (recommended)
 *      Example: SIDECAR_API_KEYS=key1:supersecret32byteskey1,key2:another32bytes
 *   2. SIDECAR_TOKEN     — single legacy token (backward-compat fallback, dev only)
 *   3. DEV_FALLBACK      — hardcoded dev placeholder when neither above is set
 *
 * In production (NODE_ENV=production) only SIDECAR_API_KEYS is accepted.
 */
import { timingSafeEqual } from './jwt.js';
import type { Config } from '../core/config/env.schema.js';

export interface ApiKey {
  id: string;
  secretHash: Buffer; // stored as raw bytes, never as plain text
}

/** Single global instance — keys never change at runtime in this design. */
let registry: Map<string, ApiKey> = new Map();

/**
 * Load keys into the registry. Call once at startup.
 * In development, falls back to SIDECAR_TOKEN or the dev placeholder.
 */
export function loadApiKeys(config: Config): void {
  registry = new Map();

  if (process.env.NODE_ENV === 'production') {
    const raw = process.env.SIDECAR_API_KEYS;
    if (!raw) throw new Error('SIDECAR_API_KEYS must be set in production');
    for (const entry of raw.split(',').filter(Boolean)) {
      const colon = entry.indexOf(':');
      if (colon <= 0 || colon === entry.length - 1) {
        throw new Error(`Invalid SIDECAR_API_KEYS entry: "${entry}" — expected "kid:secret"`);
      }
      const id = entry.slice(0, colon);
      const secret = entry.slice(colon + 1);
      if (secret.length < 16) {
        throw new Error(`API key secret for "${id}" must be at least 16 characters`);
      }
      registry.set(id, { id, secretHash: Buffer.from(secret, 'utf8') });
    }
    if (registry.size === 0) throw new Error('SIDECAR_API_KEYS is empty in production');
    return;
  }

  // Development / peer mode
  const apiKeys = process.env.SIDECAR_API_KEYS;
  if (apiKeys) {
    // Same parsing as production but don't enforce
    for (const entry of apiKeys.split(',').filter(Boolean)) {
      const colon = entry.indexOf(':');
      if (colon <= 0 || colon === entry.length - 1) continue;
      const id = entry.slice(0, colon);
      const secret = entry.slice(colon + 1);
      if (secret.length >= 16) {
        registry.set(id, { id, secretHash: Buffer.from(secret, 'utf8') });
      }
    }
  }

  // Fallback: legacy SIDECAR_TOKEN
  const legacy = process.env.SIDECAR_TOKEN;
  if (legacy && legacy.length >= 16) {
    registry.set('__legacy__', { id: '__legacy__', secretHash: Buffer.from(legacy, 'utf8') });
  }

  // Last-resort dev default (allows the sidecar to boot)
  if (registry.size === 0) {
    const devDefault = 'dev-only-token-replace-in-production-32chars';
    registry.set('__dev_default__', {
      id: '__dev_default__',
      secretHash: Buffer.from(devDefault, 'utf8'),
    });
  }
}

/**
 * Verify an API key secret against the registry.
 * Returns the key ID (kid) on success, null if not found.
 * Uses constant-time comparison so timing attacks are not viable.
 */
export function verifyApiKey(secret: string): string | null {
  const secretBuf = Buffer.from(secret, 'utf8');
  for (const key of registry.values()) {
    if (
      secretBuf.length === key.secretHash.length &&
      timingSafeEqual(secretBuf, key.secretHash)
    ) {
      return key.id;
    }
  }
  return null;
}

/** Return the raw signing secret for a given key ID (used to sign JWTs). */
export function getSigningSecret(kid: string): Buffer | null {
  const key = registry.get(kid);
  return key ? key.secretHash : null;
}

/** All registered key IDs — used for startup diagnostics. */
export function registeredKeyIds(): string[] {
  return [...registry.keys()];
}
