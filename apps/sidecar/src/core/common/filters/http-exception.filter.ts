/**
 * HttpExceptionFilter — replaces `middlewares/error.middleware.ts`.
 *
 * Catches `SidecarError` (business errors with a code + httpStatus) and
 * `ZodValidationException` (DTO schema failures). Anything else becomes
 * a 500.
 *
 * Uses Express `Response` API directly (per §0 of plan — Express adapter).
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
import type { Response } from 'express'
import {
  ErrorCode,
  SidecarError,
  httpStatusFor,
  toErrorBody,
} from '../../../infrastructure/errors/index.js'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(err: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()

    if (err instanceof SidecarError) {
      res.status(err.httpStatus).json(toErrorBody(err))
      return
    }

    if (err instanceof ZodValidationException) {
      const zErr = err.getZodError?.() as { issues?: unknown } | undefined
      res.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: ErrorCode.BAD_REQUEST,
          message: 'Request validation failed',
          details: zErr?.issues ?? err.message,
        },
      })
      return
    }

    if (err instanceof HttpException) {
      const status = err.getStatus()
      const body = err.getResponse()
      res.status(status).json(
        typeof body === 'string' ? { error: { code: httpStatusFor(ErrorCode.INTERNAL), message: body } } : body,
      )
      return
    }

    // Unhandled error → 500 with INTERNAL code
    const message = err instanceof Error ? err.message : String(err)
    this.logger.error(message, err instanceof Error ? err.stack : undefined)
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: ErrorCode.INTERNAL, message: 'Internal error' },
    })
  }
}
