import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../base/hyper/types'
import {
  addSubscribedDrive,
  listSubscribedDrives,
  removeSubscribedDrive,
  updateSubscribedDriveRemark,
} from './service'

export async function registerSubscribedDriveController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/subscribed-drives', async () => {
    const data = await listSubscribedDrives(hyper)

    return {
      success: true,
      data,
      total: data.length,
    }
  })

  app.post('/api/subscribed-drives', async (request, reply) => {
    const body = request.body as {
      driveKey?: string
      key?: string
      name?: string
    } | null
    const driveKey = body?.driveKey ?? body?.key

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const record = await addSubscribedDrive(hyper, driveKey, body?.name)

      return {
        success: true,
        data: record,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '订阅创建失败。',
      })
    }
  })

  app.patch('/api/subscribed-drives/:driveKey', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }
    const body = request.body as { remark?: string } | null

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const record = await updateSubscribedDriveRemark(hyper, driveKey, body?.remark)

      return {
        success: true,
        data: record,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '订阅备注更新失败。',
      })
    }
  })

  app.delete('/api/subscribed-drives/:driveKey', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const record = await removeSubscribedDrive(hyper, driveKey)

      return {
        success: true,
        data: record,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '订阅移除失败。',
      })
    }
  })
}
