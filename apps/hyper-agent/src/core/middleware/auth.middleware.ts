/**
 * AuthMiddleware — preserves the legacy `Authorization: Bearer <JWT>` and
 * `X-Sidecar-Token` paths so dev tooling keeps working.
 *
 * On success, stamps `req.apiKeyId = kid`. On failure, the response is
 * an RFC 9457 ProblemDetails envelope (see HttpExceptionFilter); the
 * middleware writes it directly because it short-circuits before the
 * filter runs.
 *
 * Ticket 09 collapses this to a single shared-secret bearer; the JWT
 * path remains a compatibility shim until the deprecation window
 * closes.
 */
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import type { Request, Response } from 'express'
import { verifyJwt, JwtError } from '../../auth/jwt.js'
import {
  verifyApiKey,
  getSigningSecret,
  registeredKeyIds,
} from '../../auth/keys.js'
import {
  MISSING_TOKEN,
  INVALID_TOKEN,
  PROBLEM_CONTENT_TYPE,
  toProblemDetails,
} from '../../infrastructure/errors/index.js'

function sendProblem(
  res: Response,
  spec: { uri: string; title: string; status: number },
  detail: string,
  instance: string,
  hint?: string,
): void {
  res
    .status(spec.status)
    .setHeader('Content-Type', PROBLEM_CONTENT_TYPE)
    .json(
      toProblemDetails(spec, {
        detail: hint ? `${detail} (${hint})` : detail,
        instance,
      }),
    )
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthMiddleware.name)

  use(req: Request, res: Response, next: () => void): void {
    const instance = req.originalUrl ?? req.url
    const authHeader = req.headers['authorization']
    const legacyHeader = req.headers['x-sidecar-token']

    // ── Path 1: Authorization: Bearer <JWT> ───────────────────────────
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const jwt = authHeader.slice(7).trim()
      if (jwt.length === 0) {
        sendProblem(res, MISSING_TOKEN, 'Empty Bearer token', instance)
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
          sendProblem(res, INVALID_TOKEN, `JWT verification failed: ${msg}`, instance)
          return
        }
      }

      if (verified) {
        next()
        return
      }

      sendProblem(
        res,
        INVALID_TOKEN,
        'JWT signed by an unknown key',
        instance,
        'hint: request a new token via POST /v1/auth/token',
      )
      return
    }

    // ── Path 2: X-Sidecar-Token (legacy, dev only) ────────────────────
    if (process.env.NODE_ENV === 'production') {
      if (typeof legacyHeader === 'string') {
        sendProblem(
          res,
          INVALID_TOKEN,
          'X-Sidecar-Token is not accepted in production. ' +
            'Use POST /v1/auth/token to obtain a JWT.',
          instance,
        )
        return
      }
      sendProblem(
        res,
        MISSING_TOKEN,
        'Missing Authorization header. Obtain a JWT via POST /v1/auth/token.',
        instance,
      )
      return
    }

    if (typeof legacyHeader !== 'string' || legacyHeader.length === 0) {
      sendProblem(res, MISSING_TOKEN, 'Missing X-Sidecar-Token header', instance)
      return
    }

    const kid = verifyApiKey(legacyHeader)
    if (!kid) {
      sendProblem(
        res,
        INVALID_TOKEN,
        'Invalid X-Sidecar-Token',
        instance,
        'hint: token does not match this Hyper Agent instance',
      )
      return
    }

    ;(req as unknown as { apiKeyId: string }).apiKeyId = kid
    next()
  }
}
