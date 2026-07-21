/**
 * Controllers barrel — CSR layer: HTTP transport adapters.
 *
 * Exports a single `registerControllers(app, deps)` so the
 * composition root (`middlewares/server.ts`) only needs one entry
 * point.
 */
import type { FastifyInstance } from 'fastify'
import type { Services } from '../bootstrap/index.js'
import type { SDK } from '../infrastructure/index.js'
import { DrivesController } from './drives.controller.js'
import { SwarmController } from './swarm.controller.js'
import { IdentityController } from './identity.controller.js'
import { AuthController } from './auth.controller.js'
import { HealthController } from './health.controller.js'
import { TestController } from './_test.controller.js'

export interface ControllerDeps {
  services: Services
  /**
   * The SDK is needed by `TestController` (test-only). When not
   * mounting test routes, the caller can pass `undefined`.
   */
  sdk?: SDK
}

export function registerControllers(
  app: FastifyInstance,
  deps: ControllerDeps,
): void {
  const { services } = deps

  // Public — no auth
  new HealthController().register(app)
  new AuthController().register(app)

  // Authenticated /v1/* — registered before preHandler so swagger
  // documents them.
  new DrivesController(services.drives, services.files).register(app)
  new SwarmController(services.swarm).register(app)
  new IdentityController(services.swarm).register(app)

  if (deps.sdk) {
    new TestController(deps.sdk).register(app)
  }
}

export { DrivesController, SwarmController, IdentityController, AuthController, HealthController, TestController }
export * from './schemas.js'