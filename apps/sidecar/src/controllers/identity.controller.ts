/**
 * IdentityController — `/v1/identity` HTTP route.
 */
import type { FastifyInstance } from 'fastify'
import type { SwarmService } from '../services/swarm.service.js'
import { IdentityInfoSchema } from './schemas.js'

export class IdentityController {
  constructor(private readonly swarm: SwarmService) {}

  register(app: FastifyInstance): void {
    app.get('/v1/identity', {
      schema: { response: { 200: IdentityInfoSchema } },
    }, async () => this.swarm.identity())
  }
}