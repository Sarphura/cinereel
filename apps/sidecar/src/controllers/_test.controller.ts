/**
 * TestController — `/v1/_test/*` HTTP routes.
 *
 * Mounted ONLY when `buildServer({ testRoutes: true })` is passed AND
 * `NODE_ENV !== 'production'`. Production binaries cannot expose these.
 *
 * Why a separate prefix?
 *   - Makes it easy to grep for /v1/_test/ in audits — anything behind
 *     that path is a test surface, never a user surface.
 *   - Lets the auth middleware deliberately bypass these routes (the
 *     path prefix `/v1/_test/` is added to the public-route allow-list
 *     alongside `/docs`, `/healthz`, and `/v1/auth/*`).
 *
 * Why we inject into `sdk.connections` directly:
 *   We push synthetic connection objects into the underlying Hyperswarm's
 *   `connections` Set so that `SwarmService.getPeers()` (which reads from
 *   `PeerConnectionRepository.list()`) reflects them. The official
 *   `hyper-sdk` does not expose a public API for this; production code
 *   never reaches this prefix.
 *
 * Note: the official SDK's TypeScript types declare `sdk.connections` as
 * `Connection[]`, but at runtime it returns Hyperswarm's underlying
 * `Set<Connection>`. We treat it as a `Set` for `.add` / `.delete` /
 * `.size`, and `.length` would yield `undefined`.
 */
import type { FastifyInstance } from 'fastify'
import type { SDK } from '../infrastructure/index.js'
import { Hex64 } from './schemas.js'

interface SyntheticConnection {
  remotePublicKey: Buffer
  on: (event: 'close', cb: () => void) => unknown
}

function buildSyntheticConnection(publicKeyHex: string): SyntheticConnection {
  const buf = Buffer.from(publicKeyHex, 'hex')
  return {
    remotePublicKey: buf,
    // `on()` is part of the Connection contract; we never subscribe to
    // anything here so a no-op shim is enough.
    on: () => ({}),
  }
}

export class TestController {
  constructor(private readonly sdk: SDK) {}

  register(app: FastifyInstance): void {
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
      const { publicKey } = req.body as { publicKey: string }
      const buf = Buffer.from(publicKey, 'hex')
      const connections = this.sdk.connections as unknown as Set<SyntheticConnection>
      // Idempotent: if a connection for this key already exists, leave it
      // untouched so `connectedAt` stays stable across re-injection.
      for (const conn of connections) {
        if (conn.remotePublicKey.equals(buf)) {
          return { ok: true, peerCount: connections.size }
        }
      }
      connections.add(buildSyntheticConnection(publicKey))
      return { ok: true, peerCount: connections.size }
    })

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
      const { publicKey } = req.params as { publicKey: string }
      const buf = Buffer.from(publicKey, 'hex')
      const connections = this.sdk.connections as unknown as Set<SyntheticConnection>
      for (const conn of connections) {
        if (conn.remotePublicKey.equals(buf)) {
          connections.delete(conn)
          break
        }
      }
      return { ok: true, peerCount: connections.size }
    })
  }
}