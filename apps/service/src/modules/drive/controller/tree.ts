import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../../base/hyper/types'
import { getDriveTree, refreshDriveFromSource } from '../service'

export async function registerDriveTreeController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/drives/:driveKey/tree', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const data = await getDriveTree(hyper, driveKey)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '加载 Drive 资源树失败。',
      })
    }
  })

  app.post('/api/drives/:driveKey/refresh', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const data = await refreshDriveFromSource(hyper, driveKey)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '刷新 Drive 资源树失败。',
      })
    }
  })
}
