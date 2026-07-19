/**
 * Test-only HTTP routes that drive SDK test hooks (`SwarmService.__testInjectPeer`).
 *
 * Mounted ONLY when `buildServer({ testRoutes: true })` is passed AND
 * `NODE_ENV !== 'production'`. Production binaries cannot expose these.
 *
 * Why a separate prefix?
 *   - Makes it easy to grep for /v1/_test/ in audits — anything behind that
 *     path is a test surface, never a user surface.
 *   - Lets the auth hook deliberately bypass these routes (the path prefix
 *     `/v1/_test/` is added to the public-route allow-list alongside `/docs`,
 *     `/healthz`, and `/v1/auth/*`).
 */
import type { FastifyInstance } from 'fastify';
import type { SwarmService } from '@cinereel/hyper-sdk';
import { Hex64 } from '../schemas.js';

export async function registerTestRoutes(
  app: FastifyInstance,
  swarm: SwarmService,
): Promise<void> {
  app.post('/v1/_test/peer', {
    schema: {
      body: {
        type: 'object',
        required: ['publicKey'],
        properties: { publicKey: Hex64 },
      },
      response: {
        200: {
          type: 'object',
          required: ['ok', 'peerCount'],
          properties: {
            ok: { type: 'boolean' },
            peerCount: { type: 'integer' },
          },
        },
      },
    },
  }, async (req) => {
    const { publicKey } = req.body as { publicKey: string };
    swarm.__testInjectPeer(publicKey);
    return { ok: true, peerCount: swarm.identity().peerCount };
  });

  app.delete('/v1/_test/peer/:publicKey', {
    schema: {
      params: { type: 'object', required: ['publicKey'], properties: { publicKey: Hex64 } },
      response: {
        200: {
          type: 'object',
          required: ['ok', 'peerCount'],
          properties: {
            ok: { type: 'boolean' },
            peerCount: { type: 'integer' },
          },
        },
      },
    },
  }, async (req) => {
    const { publicKey } = req.params as { publicKey: string };
    swarm.__testRemovePeer(publicKey);
    return { ok: true, peerCount: swarm.identity().peerCount };
  });
}
