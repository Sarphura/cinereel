/**
 * Fastify composition root.
 *
 * Wires:
 *   - CORS + Swagger + Swagger-UI
 *   - All public + authed routes (delegated to `controllers/index.ts`)
 *   - Auth preHandler for /v1/* (skips /v1/auth/* and /v1/_test/*)
 *   - Error serializer (mapping `SidecarError` + Fastify validation
 *     errors to the wire-format `error.code/message` body)
 *
 * The services bag is provided by `bootstrap/` — this file does not
 * construct any business logic itself; it only registers controllers
 * against already-built services.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { Config } from '../config/index.js'
import type { Services } from '../bootstrap/index.js'
import type { SDK } from '../infrastructure/index.js'
import { registerControllers } from '../controllers/index.js'
import { registerAuthMiddleware } from './register-auth.js'
import { registerErrorHandler } from './error.middleware.js'

export interface BuildServerOptions {
  /**
   * When true, register a couple of *test-only* routes under
   * `/v1/_test/...` that exercise SDK test hooks. Tests opt in
   * explicitly via this flag; production code paths never set it. The
   * flag is dropped entirely when `NODE_ENV === 'production'`.
   */
  testRoutes?: boolean
}

export async function buildServer(
  config: Config,
  services: Services,
  sdk: SDK,
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } },
    },
  })

  await app.register(cors, {
    origin: ['http://127.0.0.1:5237', 'http://localhost:5237'],
  })

  await app.register(swagger, {
    openapi: {
      info: { title: 'CineReel Hyper Sidecar', version: '0.0.1' },
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  })

  // Register controllers (public + authed)
  const wantsTestRoutes =
    options.testRoutes === true && process.env.NODE_ENV !== 'production'
  registerControllers(app, {
    services,
    sdk: wantsTestRoutes ? sdk : undefined,
  })

  // Auth gate for /v1/* (skips /v1/auth/* and /v1/_test/*)
  registerAuthMiddleware(app, config)

  // Error serializer
  registerErrorHandler(app)

  return app
}