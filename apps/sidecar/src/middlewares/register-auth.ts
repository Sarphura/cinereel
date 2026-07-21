/**
 * Auth middleware wiring — adds a `preHandler` to /v1/* that delegates to
 * `makeAuthPreHandler`. Skips `/v1/auth/*` (its own auth logic) and
 * `/v1/_test/*` (test hooks).
 */
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config/index.js'
import { makeAuthPreHandler } from './auth.middleware.js'

export function registerAuthMiddleware(app: FastifyInstance, config: Config): void {
  const authPreHandler = makeAuthPreHandler(config)
  app.addHook('preHandler', async (req, reply) => {
    if (
      !req.url.startsWith('/v1/') ||
      req.url.startsWith('/v1/auth') ||
      req.url.startsWith('/v1/_test/')
    ) {
      return
    }
    await authPreHandler(req, reply)
  })
}