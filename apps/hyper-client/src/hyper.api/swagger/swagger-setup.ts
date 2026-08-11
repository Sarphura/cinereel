/**
 * OpenAPI document builder — used by main.ts (for dev UI mount) and the
 * snapshot test. Bearer scheme is added here so every `@ApiBearerAuth('bearer')`
 * in feature controllers is associated with a real security entry.
 */
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { INestApplication } from '@nestjs/common'
import { SECURITY_BEARER } from './security.constants.js'

export { SECURITY_BEARER }

export function buildOpenAPI(app: INestApplication): ReturnType<typeof SwaggerModule.createDocument> {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CineReel Hyper Sidecar')
      .setVersion('0.0.1')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        SECURITY_BEARER,
      )
      .addTag('drives', 'drive CRUD + file ops')
      .addTag('swarm', 'Hyperswarm mount/announce/peers')
      .addTag('identity', 'node identity')
      .addTag('auth', 'token exchange')
      .addTag('health', 'liveness')
      .build(),
  )
}
