import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import {
  addSubscription,
  listSubscriptions,
  removeSubscription,
  updateSubscriptionRemark,
} from './service'

export async function registerSubscriptionController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/subscriptions', async () => {
    const data = await listSubscriptions(hyper)

    return {
      success: true,
      data,
      total: data.length,
    }
  })

  app.post('/api/subscriptions', async (request, reply) => {
    const body = request.body as { driveKey?: string; key?: string; name?: string } | null
    const driveKey = body?.driveKey ?? body?.key

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const record = await addSubscription(hyper, driveKey, body?.name)

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

  app.patch('/api/subscriptions/:driveKey', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }
    const body = request.body as { remark?: string } | null

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const record = await updateSubscriptionRemark(hyper, driveKey, body?.remark)

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

  app.delete('/api/subscriptions/:driveKey', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const record = await removeSubscription(hyper, driveKey)

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
