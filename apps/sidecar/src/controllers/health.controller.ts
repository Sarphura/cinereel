/**
 * HealthController — GET /healthz (public, no auth).
 */
import type { FastifyInstance } from 'fastify'
import { HealthResponseSchema } from './schemas.js'

export class HealthController {
  private readonly startedAt = Date.now()

  register(app: FastifyInstance): void {
    app.get('/healthz', {
      schema: {
        response: { 200: HealthResponseSchema },
      },
    }, async () => ({
      status: 'ok' as const,
      uptime: (Date.now() - this.startedAt) / 1000,
    }))
  }
}