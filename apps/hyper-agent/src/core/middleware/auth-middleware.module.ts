/**
 * AuthMiddlewareModule — mounts the AuthMiddleware on every route.
 *
 * Ticket 09 collapses the legacy "skip /v1/auth/*, /v1/_test/*" carve-out:
 * per the spec, every endpoint (including `/healthz`) requires the
 * shared-secret token. The Application Server is the only legitimate
 * client, so there is no need for a public POST /v1/auth/token.
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { AuthMiddleware } from './auth.middleware.js'

@Module({})
export class AuthMiddlewareModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*')
  }
}
