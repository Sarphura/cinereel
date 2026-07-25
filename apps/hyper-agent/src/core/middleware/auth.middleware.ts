/**
 * AuthMiddleware — single shared-secret bearer (ticket 09).
 *
 * The Hyper Agent authenticates every HTTP request with the shared
 * secret loaded from `<CINEREEL_DATA_DIR>/sidecar.token` at startup.
 * The middleware accepts either header form for operator curl
 * convenience:
 *
 *   - `Authorization: Bearer <token>`
 *   - `X-Sidecar-Token: <token>`
 *
 * No JWT, no per-key registry, no `SIDECAR_API_KEYS` — the loopback
 * shared secret is sufficient because the Application Server is the
 * only legitimate client. The token is injected via the `SHARED_TOKEN`
 * provider; tests override that provider with a deterministic value.
 *
 * On failure the middleware emits an RFC 9457 ProblemDetails response
 * directly. It writes the body itself because it short-circuits before
 * the global HttpExceptionFilter runs.
 */
import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import type { Request, Response } from 'express'
import {
  SHARED_TOKEN,
  type SharedTokenPort,
} from '../../infrastructure/security/security.tokens.js'
import { verifySharedToken } from '../../infrastructure/security/shared-token.js'
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

  constructor(@Inject(SHARED_TOKEN) private readonly expected: SharedTokenPort) {}

  use(req: Request, res: Response, next: () => void): void {
    const instance = req.originalUrl ?? req.url
    const presented = extractToken(
      req.headers['authorization'],
      req.headers['x-sidecar-token'],
    )

    if (!presented) {
      sendProblem(
        res,
        MISSING_TOKEN,
        'Missing Authorization: Bearer <token> or X-Sidecar-Token header',
        instance,
      )
      return
    }

    if (!verifySharedToken(this.expected, presented)) {
      sendProblem(
        res,
        INVALID_TOKEN,
        'Token does not match this Hyper Agent instance',
        instance,
        'hint: read <CINEREEL_DATA_DIR>/sidecar.token',
      )
      return
    }

    next()
  }
}

function extractToken(
  authHeader: string | string[] | undefined,
  legacyHeader: string | string[] | undefined,
): string | null {
  const auth =
    typeof authHeader === 'string'
      ? authHeader
      : Array.isArray(authHeader)
        ? authHeader[0]
        : undefined
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const slice = auth.slice(7).trim()
    if (slice.length > 0) return slice
  }
  const legacy =
    typeof legacyHeader === 'string'
      ? legacyHeader
      : Array.isArray(legacyHeader)
        ? legacyHeader[0]
        : undefined
  if (typeof legacy === 'string' && legacy.length > 0) return legacy
  return null
}
