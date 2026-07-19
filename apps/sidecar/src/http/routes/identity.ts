import type { FastifyInstance } from 'fastify';
import type { SwarmService } from '@cinereel/hyper-sdk';
import { IdentityInfoSchema } from '../schemas.js';

export async function registerIdentityRoute(
  app: FastifyInstance,
  swarm: SwarmService,
): Promise<void> {
  app.get('/v1/identity', {
    schema: { response: { 200: IdentityInfoSchema } },
  }, async () => swarm.identity());
}
