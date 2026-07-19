/**
 * Minimal HS256 JWT implementation using Node's built-in `crypto`.
 * No external dependencies — ships with Node 20+.
 *
 * JWT structure (RFC 7519):
 *   header.payload.signature
 * All three segments are base64url-encoded and dot-joined.
 */
import { createHmac, randomBytes, timingSafeEqual as _timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string;       // key ID (kid)
  iat: number;       // issued-at Unix timestamp
  exp: number;       // expiration Unix timestamp
  [extra: string]: unknown;
}

export interface VerifiedToken {
  kid: string;
  payload: JwtPayload;
}

// Re-export timing-safe compare so callers don't need node:crypto directly
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return _timingSafeEqual(a, b);
}

/**
 * HMAC-SHA256 over `${headerB64}.${payloadB64}`. Returns the raw 32-byte
 * digest. Both `signJwt()` and `verifyJwt()` go through this so they always
 * compare apples to apples — never base64url string vs raw bytes.
 */
function hmacSha256(headerB64: string, payloadB64: string, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
}

function base64urlEncode(data: Uint8Array | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str: string): Buffer {
  // Restore padding
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const mod = padded.length % 4;
  const pad = mod === 0 ? '' : '='.repeat(4 - mod);
  return Buffer.from(padded + pad, 'base64');
}

/**
 * HMAC-SHA256 over `${headerB64}.${payloadB64}` and return the base64url
 * encoding. Equivalent to `base64urlEncode(hmacSha256(...))` but inlined
 * so sign() and verifyJwt() share the same primitive.
 */
function sign(header: string, payload: string, secret: Buffer): string {
  return base64urlEncode(hmacSha256(header, payload, secret));
}

/** Sign a new JWT. Returns the compact serialization string. */
export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: Buffer,
  expiresInSeconds = 15 * 60,
): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat: now, exp: now + expiresInSeconds } as JwtPayload;
  const encodedPayload = base64urlEncode(JSON.stringify(full));
  const signature = sign(header, encodedPayload, secret);
  return `${header}.${encodedPayload}.${signature}`;
}

/** Verify and decode a JWT. Returns the payload on success, throws on failure. */
export function verifyJwt(token: string, secret: Buffer): VerifiedToken {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('malformed token');

  const [headerB64, payloadB64, sigB64] = parts;

  // Re-compute the HMAC over `${headerB64}.${payloadB64}` using the SAME
  // helper that produced the original signature, then compare the raw 32-byte
  // digests in constant time. The previous implementation compared the raw
  // decoded signature against a base64url-encoded string's UTF-8 bytes,
  // which can never match — every JWT verification silently threw.
  const expectedSig = hmacSha256(headerB64, payloadB64, secret);
  const sigBuf = base64urlDecode(sigB64);
  if (sigBuf.length !== expectedSig.length || !timingSafeEqual(sigBuf, expectedSig)) {
    throw new JwtError('signature mismatch');
  }

  // Decode payload
  const payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8')) as JwtPayload;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new JwtError('token expired');
  }

  if (typeof payload.iat === 'number' && payload.iat > now + 60) {
    throw new JwtError('token not yet valid (iat in the future)');
  }

  if (!payload.sub) throw new JwtError('missing sub claim');

  return { kid: payload.sub, payload };
}

export class JwtError extends Error {
  readonly code: 'MALFORMED' | 'SIGNATURE_MISMATCH' | 'EXPIRED' | 'NOT_YET_VALID' | 'MISSING_SUB';
  constructor(msg: string) {
    super(msg);
    this.name = 'JwtError';
    if (msg.includes('malformed')) this.code = 'MALFORMED';
    else if (msg.includes('signature')) this.code = 'SIGNATURE_MISMATCH';
    else if (msg.includes('expired')) this.code = 'EXPIRED';
    else if (msg.includes('not yet valid')) this.code = 'NOT_YET_VALID';
    else this.code = 'MISSING_SUB';
  }
}

/** Generate a cryptographically random API key string (no prefix — just raw entropy). */
export function generateApiKey(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
