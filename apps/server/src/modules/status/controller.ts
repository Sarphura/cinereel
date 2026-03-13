import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'

export async function registerStatusController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/status', async () => {
    return {
      app: 'Cinereel Core Node',
      status: 'running',
      version: '2.0.0',
      peers: hyper.swarm.connections.size,
      driveKey: hyper.driveKey,
      storeDir: hyper.storeDir,
    }
  })
}
