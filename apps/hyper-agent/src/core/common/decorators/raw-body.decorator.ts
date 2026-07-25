import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { RAW_BODY_KEY } from '../middleware/raw-body.middleware.js'

/**
 * @RawBody() → Buffer placed on the request by `express.raw()` middleware
 * in `main.ts` (only registered for octet-stream PUT routes).
 */
export const RawBody = createParamDecorator((_d: unknown, ctx: ExecutionContext): Buffer => {
  const req = ctx.switchToHttp().getRequest<Request & { [k: symbol]: Buffer }>()
  return req[RAW_BODY_KEY]
})
