/**
 * Test-only HTTP routes that drive SDK test hooks.
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
 *
 * Why we inject into `swarm.connections` directly:
 *   The SDK previously exposed `SwarmService.__testInjectPeer` /
 *   `__testRemovePeer` as test hooks. Those hooks were removed because they
 *   are implementation detail (they manipulate the underlying Hyperswarm's
 *   `connections` Set), not service surface — keeping them off the public
 *   service boundary makes it harder for production callers to depend on
 *   them by accident. We still need a way to drive synthetic peers from the
 *   in-process HTTP test suite, so we accept the `SwarmRuntime` here and
 *   poke the same `connections` Set the SDK reads from in `getPeers`.
 *   This module is test-only by construction; production code never sees
 *   the `_test/` prefix.
 */
import type { FastifyInstance } from 'fastify';
import type { SwarmRuntime, SwarmService } from '@cinereel/hyper-sdk';
import { Hex64 } from '../schemas.js';

interface SyntheticConnection {
  remotePublicKey: Buffer;
  _connectedAt: string;
  on: (event: 'close', cb: () => void) => unknown;
}

function buildSyntheticConnection(publicKeyHex: string): SyntheticConnection {
  const buf = Buffer.from(publicKeyHex, 'hex');
  return {
    remotePublicKey: buf,
    _connectedAt: new Date().toISOString(),
    // `on()` is part of the Connection contract that `getPeers` reads; we
    // never subscribe to anything here so a no-op shim is enough.
    on: () => ({ /* no-op */ }),
  };
}

export async function registerTestRoutes(
  app: FastifyInstance,
  swarm: SwarmService,
  swarmRuntime: SwarmRuntime,
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
    const buf = Buffer.from(publicKey, 'hex');
    const connections = swarmRuntime.swarm.connections as Set<SyntheticConnection>;
    // Idempotent: if a connection for this key already exists, leave it
    // untouched so `connectedAt` stays stable across re-injection.
    for (const conn of connections) {
      if (conn.remotePublicKey.equals(buf)) {
        return { ok: true, peerCount: swarm.identity().peerCount };
      }
    }
    connections.add(buildSyntheticConnection(publicKey));
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
    const buf = Buffer.from(publicKey, 'hex');
    const connections = swarmRuntime.swarm.connections as Set<SyntheticConnection>;
    for (const conn of connections) {
      if (conn.remotePublicKey.equals(buf)) {
        connections.delete(conn);
        break;
      }
    }
    return { ok: true, peerCount: swarm.identity().peerCount };
  });
}