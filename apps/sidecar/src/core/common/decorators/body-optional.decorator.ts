import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

/**
 * @BodyOptional() — like @Body() but returns `undefined` when the request
 * has no body (POST without payload, Apifox test requests, idempotent
 * retries). Used by `POST /v1/swarm/announce` whose original wire allowed
 * `anyOf: [object, null]` semantics.
 *
 * Returns the parsed body object when present (may be empty `{}`).
 */
export const BodyOptional = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>()
  const body = req.body
  if (body === undefined || body === null) return undefined
  if (typeof body === 'object' && Object.keys(body as object).length === 0) return undefined
  return body
})
