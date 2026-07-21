/**
 * SwarmController — `/v1/swarm/*` HTTP routes.
 *
 *   - POST /v1/swarm/announce
 *   - GET  /v1/swarm/peers
 *   - POST /v1/swarm/mount/:publicKey
 *   - POST /v1/swarm/unmount/:publicKey
 */
import type { FastifyInstance } from 'fastify'
import type { SwarmService } from '../services/swarm.service.js'
import { AnnounceBody, Hex64, PeerInfoSchema } from './schemas.js'

export class SwarmController {
  constructor(private readonly swarm: SwarmService) {}

  register(app: FastifyInstance): void {
    app.post('/v1/swarm/announce', {
      schema: {
        body: AnnounceBody,
        response: {
          200: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
        },
      },
    }, async (req) => {
      const body = (req.body ?? {}) as { wait?: boolean }
      // Default to wait=true so the announcement round-trip actually finishes
      // before HTTP returns; `wait=false` historically returned 200 before
      // any peer had been seen.
      await this.swarm.announce(body.wait ?? true)
      return { ok: true }
    })

    app.get('/v1/swarm/peers', {
      schema: { response: { 200: { type: 'array', items: PeerInfoSchema } } },
    }, async () => this.swarm.getPeers())

    app.post('/v1/swarm/mount/:publicKey', {
      schema: {
        params: { type: 'object', required: ['publicKey'], properties: { publicKey: Hex64 } },
        response: {
          200: { type: 'object', required: ['driveKey'], properties: { driveKey: { type: 'string' } } },
        },
      },
    }, async (req) => {
      const { publicKey } = req.params as { publicKey: string }
      return this.swarm.mount(publicKey)
    })

    app.post('/v1/swarm/unmount/:publicKey', {
      schema: {
        params: { type: 'object', required: ['publicKey'], properties: { publicKey: Hex64 } },
        response: {
          200: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
        },
      },
    }, async (req) => {
      const { publicKey } = req.params as { publicKey: string }
      await this.swarm.unmount(publicKey)
      return { ok: true }
    })
  }
}