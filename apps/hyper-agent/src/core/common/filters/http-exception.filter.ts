/**
 * HttpExceptionFilter — RFC 9457 ProblemDetails.
 *
 * Every 4xx / 5xx response from the Hyper Agent carries:
 *
 *   Content-Type: application/problem+json
 *   {
 *     "type":   "https://cinereel.dev/errors/<slug>",
 *     "title":  "<short>",
 *     "status": <int>,
 *     "detail": "<optional>",
 *     "instance": "<request path>"
 *   }
 *
 * Stack traces are NEVER emitted in 5xx response bodies — they are
 * logged at error level instead.
 *
 * ADR 0032 / ADR 0051 / ticket 08.
 */
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { ZodValidationException } from 'nestjs-zod'
import type { Request, Response } from 'express'
import {
  INVALID_INPUT,
  INTERNAL,
  PROBLEM_CONTENT_TYPE,
  httpStatusFallback,
  HttpProblem,
  toProblemDetails,
} from '../../../infrastructure/errors/index.js'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(err: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<Request>()
    const res = ctx.getResponse<Response>()
    const instance = req.originalUrl ?? req.url

    // 1. Business-layer typed exception.
    if (err instanceof HttpProblem) {
      const body = toProblemDetails(err.spec, {
        detail: err.detail,
        instance,
      })
      this.send(res, body)
      return
    }

    // 2. Zod schema validation failure → 400 invalid-input.
    if (err instanceof ZodValidationException) {
      const zErr = err.getZodError?.() as { issues?: unknown } | undefined
      const detail = zErr?.issues
        ? `Request validation failed: ${JSON.stringify(zErr.issues)}`
        : err.message
      const body = toProblemDetails(INVALID_INPUT, { detail, instance })
      this.send(res, body)
      return
    }

    // 3. Nest HttpException — catch-all `http-<status>`.
    if (err instanceof HttpException) {
      const status = err.getStatus()
      const body = err.getResponse()
      const detail =
        typeof body === 'string'
          ? body
          : typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message?: unknown }).message)
            : undefined
      this.send(res, toProblemDetails(httpStatusFallback(status), { detail, instance }))
      return
    }

    // 4. Unknown error → 500 internal. Stack logged but never in body.
    const message = err instanceof Error ? err.message : String(err)
    this.logger.error(message, err instanceof Error ? err.stack : undefined)
    this.send(res, toProblemDetails(INTERNAL, { instance }))
  }

  private send(res: Response, body: unknown): void {
    const status = (body as { status?: number }).status ?? HttpStatus.INTERNAL_SERVER_ERROR
    res
      .status(status)
      .setHeader('Content-Type', PROBLEM_CONTENT_TYPE)
      .json(body)
  }
}
