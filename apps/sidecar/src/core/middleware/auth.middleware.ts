/**
 * AuthMiddleware — replaces `middlewares/auth.middleware.ts` + `register-auth.ts`.
 *
 * Preserves the exact logic from `makeAuthPreHandler`:
 *   1. Authorization: Bearer <JWT>     — preferred (verifyJwt over every registered kid)
 *   2. X-Sidecar-Token                  — dev only (legacy fallback)
 *
 * On success, stamps `req.apiKeyId = kid`. Failure responses use the
 * `{ error: { code, message, details? } }` wire shape (SidecarError body)
 * so existing Apifox tests keep matching.
 */
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import type { Request, Response } from 'express'
import { verifyJwt, JwtError } from '../../auth/jwt.js'
import {
  verifyApiKey,
  getSigningSecret,
  registeredKeyIds,
} from '../../auth/keys.js'
import { ErrorCode } from '../../infrastructure/errors/index.js'

const unauth = (res: Response, code: string, message: string, details?: unknown) => {
  res.status(401).json({
    error: details === undefined ? { code, message } : { code, message, details },
  })
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthMiddleware.name)

  use(req: Request, res: Response, next: () => void): void {
    const authHeader = req.headers['authorization']
    const legacyHeader = req.headers['x-sidecar-token']

    // ── Path 1: Authorization: Bearer <JWT> ───────────────────────────
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const jwt = authHeader.slice(7).trim()
      if (jwt.length === 0) {
        unauth(res, ErrorCode.UNAUTHENTICATED, 'Empty Bearer token')
        return
      }

      let verified = false
      for (const kid of registeredKeyIds()) {
        const secret = getSigningSecret(kid)
        if (!secret) continue
        try {
          const result = verifyJwt(jwt, secret)
          ;(req as unknown as { apiKeyId: string }).apiKeyId = result.kid
          verified = true
          break
        } catch (err) {
          if (err instanceof JwtError && err.code === 'SIGNATURE_MISMATCH') continue
          const msg = err instanceof Error ? err.message : String(err)
          unauth(res, ErrorCode.UNAUTHENTICATED, `JWT verification failed: ${msg}`)
          return
        }
      }

      if (verified) {
        next()
        return
      }

      unauth(res, ErrorCode.UNAUTHENTICATED, 'JWT signed by an unknown key', {
        hint: 'Request a new token via POST /v1/auth/token',
      })
      return
    }

    // ── Path 2: X-Sidecar-Token (legacy, dev only) ────────────────────
    if (process.env.NODE_ENV === 'production') {
      if (typeof legacyHeader === 'string') {
        unauth(
          res,
          ErrorCode.UNAUTHENTICATED,
          'X-Sidecar-Token is not accepted in production. ' +
            'Use POST /v1/auth/token to obtain a JWT.',
        )
        return
      }
      unauth(
        res,
        ErrorCode.UNAUTHENTICATED,
        'Missing Authorization header. Obtain a JWT via POST /v1/auth/token.',
      )
      return
    }

    if (typeof legacyHeader !== 'string' || legacyHeader.length === 0) {
      unauth(res, ErrorCode.UNAUTHENTICATED, 'Missing X-Sidecar-Token header')
      return
    }

    const kid = verifyApiKey(legacyHeader)
    if (!kid) {
      unauth(res, ErrorCode.UNAUTHENTICATED, 'Invalid X-Sidecar-Token', {
        hint:
          'Token does not match this sidecar instance. ' +
          'If you are pointing at a peer instance (port != 4321), ' +
          'use the SIDECAR_TOKEN value from .env.peer, not .env.development.',
      })
      return
    }

    ;(req as unknown as { apiKeyId: string }).apiKeyId = kid
    next()
  }
}
