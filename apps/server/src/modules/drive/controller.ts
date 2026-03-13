import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { createDrive, deleteDrive, getDriveTree, listDrives } from './service'

export async function registerDriveController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/drives', async () => {
    const data = await listDrives(hyper)

    return {
      success: true,
      data,
      total: data.length,
    }
  })

  app.post('/api/drives', async (request, reply) => {
    const body = request.body as { label?: string } | null

    try {
      const data = await createDrive(hyper, body?.label)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '创建 Drive 失败。',
      })
    }
  })

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

  app.delete('/api/drives/:driveKey', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const data = await deleteDrive(hyper, driveKey)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '删除 Drive 失败。',
      })
    }
  })
}
