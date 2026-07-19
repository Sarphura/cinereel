import type { FastifyInstance } from 'fastify';
import { HealthResponseSchema } from '../schemas.js';

const startedAt = Date.now();

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/healthz', {
    schema: {
      response: { 200: HealthResponseSchema },
    },
  }, async () => ({
    status: 'ok' as const,
    uptime: (Date.now() - startedAt) / 1000,
  }));
}
