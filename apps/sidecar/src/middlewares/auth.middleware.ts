/**
 * Authentication preHandler for all /v1/* routes.
 *
 * Supported credentials (in order of priority):
 *   1. Authorization: Bearer <JWT>          — preferred, 15-min expiry
 *   2. X-Sidecar-Token: <any registered key> — legacy fallback (dev only)
 *
 * Attaches `request.apiKeyId` (string) on successful auth so downstream
 * handlers can identify the caller without re-verifying.
 *
 * CSR layer: middleware. Lives in `middlewares/` (not `auth/`) because it
 * owns the Fastify request/reply flow; `auth/jwt.ts` + `auth/keys.ts` stay
 * in `auth/` as pure crypto primitives.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Config } from '../config/index.js'
import { verifyJwt, JwtError } from '../auth/jwt.js'
import { verifyApiKey, getSigningSecret, registeredKeyIds } from '../auth/keys.js'

export interface AuthenticatedRequest extends FastifyRequest {
  /** The key ID that authenticated this request (e.g. "key1" or "__legacy__"). */
  apiKeyId: string
}

export function makeAuthPreHandler(_config: Config) {
  return async function authPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers['authorization']
    const legacyHeader = request.headers['x-sidecar-token']

    // ── Path 1: Authorization: Bearer <JWT> ─────────────────────────────
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const jwt = authHeader.slice(7).trim()
      if (jwt.length === 0) {
        reply.code(401).send({
          error: { code: 'UNAUTHENTICATED', message: 'Empty Bearer token' },
        })
        throw reply
      }

      // Try to verify against each registered key's signing secret
      let verified = false
      for (const kid of registeredKeyIds()) {
        const secret = getSigningSecret(kid)
        if (!secret) continue
        try {
          const result = verifyJwt(jwt, secret)
          ;(request as unknown as AuthenticatedRequest).apiKeyId = result.kid
          verified = true
          break
        } catch (err) {
          // Not signed by this key — keep trying
          if (err instanceof JwtError && err.code === 'SIGNATURE_MISMATCH') continue
          // Other JWT errors (malformed, expired) are terminal
          const msg = err instanceof Error ? err.message : String(err)
          reply.code(401).send({
            error: {
              code: 'UNAUTHENTICATED',
              message: `JWT verification failed: ${msg}`,
            },
          })
          throw reply
        }
      }

      if (verified) return // authenticated via JWT

      // JWT present but not verified by any key
      reply.code(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'JWT signed by an unknown key',
          details: { hint: 'Request a new token via POST /v1/auth/token' },
        },
      })
      throw reply
    }

    // ── Path 2: X-Sidecar-Token (legacy, dev only) ──────────────────────
    if (process.env.NODE_ENV === 'production') {
      if (typeof legacyHeader === 'string') {
        reply.code(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message:
              'X-Sidecar-Token is not accepted in production. ' +
              'Use POST /v1/auth/token to obtain a JWT.',
          },
        })
        throw reply
      }
      reply.code(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Missing Authorization header. Obtain a JWT via POST /v1/auth/token.',
        },
      })
      throw reply
    }

    // Development / peer mode: fall back to X-Sidecar-Token
    if (typeof legacyHeader !== 'string' || legacyHeader.length === 0) {
      reply.code(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Missing X-Sidecar-Token header',
        },
      })
      throw reply
    }

    const kid = verifyApiKey(legacyHeader)
    if (!kid) {
      reply.code(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Invalid X-Sidecar-Token',
          details: {
            hint:
              'Token does not match this sidecar instance. ' +
              'If you are pointing at a peer instance (port != 4321), ' +
              'use the SIDECAR_TOKEN value from .env.peer, not .env.development.',
          },
        },
      })
      throw reply
    }

    ;(request as unknown as AuthenticatedRequest).apiKeyId = kid
  }
}