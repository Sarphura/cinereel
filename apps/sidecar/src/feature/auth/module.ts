/**
 * AuthModule — public POST /v1/auth/token route + auth middleware binding.
 *
 * Implements `NestModule.configure()` so the AuthMiddleware (mounted on
 * `consumer.apply()`) runs ONLY on /v1/swarm/*, /v1/drives/*, /v1/identity
 * — NOT on /v1/auth/* (this controller's own logic) and NOT on /v1/_test/*.
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { AuthController } from './controller.js'
import { AuthMiddleware } from '../../core/middleware/auth.middleware.js'

@Module({ controllers: [AuthController] })
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .forRoutes(
        'v1/swarm',
        'v1/swarm/*',
        'v1/drives',
        'v1/drives/*',
        'v1/identity',
      )
    // Note: /v1/auth/* and /v1/_test/* are NOT protected.
  }
}
