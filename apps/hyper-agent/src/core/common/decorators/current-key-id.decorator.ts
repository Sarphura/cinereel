import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

/**
 * @CurrentKeyId() → request.apiKeyId (set by AuthMiddleware on success).
 *
 * Returns `undefined` if the request was not authenticated (e.g. on public
 * routes mounted under /v1/* in dev mode).
 */
export const CurrentKeyId = createParamDecorator<string | undefined>(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request & { apiKeyId?: string }>()
    return req.apiKeyId
  },
)
