import type { FastifyInstance } from 'fastify';
import type { SwarmService } from '@cinereel/hyper-sdk';
import { AnnounceBody, Hex64, PeerInfoSchema } from '../schemas.js';

export async function registerSwarmRoutes(
  app: FastifyInstance,
  swarm: SwarmService,
): Promise<void> {
  app.post('/v1/swarm/announce', {
    schema: {
      body: AnnounceBody,
      response: {
        200: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      },
    },
  }, async (req) => {
    const body = (req.body ?? {}) as { wait?: boolean };
    // Default to wait=true because the hyper-sdk fix made `wait=true` the
    // correct way to block until peers show up. The old `flush` default
    // was hiding a silent no-op: drive.update() returned before any peer
    // had been seen, and announce() returned 200 anyway.
    await swarm.announce(body.wait ?? true);
    return { ok: true };
  });

  app.get('/v1/swarm/peers', {
    schema: { response: { 200: { type: 'array', items: PeerInfoSchema } } },
  }, async () => swarm.getPeers());

  app.post('/v1/swarm/mount/:publicKey', {
    schema: {
      params: { type: 'object', required: ['publicKey'], properties: { publicKey: Hex64 } },
      response: {
        200: { type: 'object', required: ['driveKey'], properties: { driveKey: { type: 'string' } } },
      },
    },
  }, async (req) => {
    const { publicKey } = req.params as { publicKey: string };
    return swarm.mount(publicKey);
  });

  app.post('/v1/swarm/unmount/:publicKey', {
    schema: {
      params: { type: 'object', required: ['publicKey'], properties: { publicKey: Hex64 } },
      response: {
        200: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      },
    },
  }, async (req) => {
    const { publicKey } = req.params as { publicKey: string };
    await swarm.unmount(publicKey);
    return { ok: true };
  });
}
