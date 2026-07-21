/**
 * Error middleware — Fastify `setErrorHandler`.
 *
 * Maps `SidecarError` (thrown by services) + Fastify schema-validation
 * errors to the wire-format `error.code/message` body. Everything else
 * falls through to a generic 500.
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { SidecarError, ErrorCode, toErrorBody, httpStatusFor } from '../infrastructure/index.js'

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof SidecarError) {
      reply.code(err.httpStatus).send(toErrorBody(err))
      return
    }
    // Fastify schema validation errors
    if (Array.isArray((err as { validation?: unknown }).validation)) {
      reply.code(400).send({
        error: {
          code: ErrorCode.BAD_REQUEST,
          message: 'Request validation failed',
          details: (err as { validation: unknown }).validation,
        },
      })
      return
    }
    const code = ErrorCode.INTERNAL
    reply.code(httpStatusFor(code)).send({
      error: { code, message: err.message ?? 'Internal error' },
    })
  })
}