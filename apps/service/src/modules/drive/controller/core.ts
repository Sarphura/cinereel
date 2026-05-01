import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../../base/hyper/types'
import { createCollectionDrive, deleteDrive, listDrives, renameDrive, updateOwnedDriveRemark } from '../service'

export async function registerDriveCoreController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/drives', {
    schema: {
      tags: ['Drive'],
      summary: 'Get all of Drive list',
      description: '返回当前节点管理的全部 Hyperdrive 及其基本状态信息'
    }
  }, async () => {
    const data = await listDrives(hyper)

    return {
      success: true,
      data,
      total: data.length,
    }
  })

  app.post('/api/drive', {
    schema: {
      tags: ['Drive'],
      summary: '创建新的 P2P 驱动器',
      description: '创建一个新的 Hyperdrive 作为媒体收藏夹，并将其注册为当前用户的收藏驱动器。'
    }
  }, async (request, reply) => {
    const body = request.body as { name?: string; type?: 'movie' | 'series' | 'music' | 'generic' } | null

    try {
      const data = await createCollectionDrive(hyper, body?.name, body?.type)

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

  app.patch('/api/drives/:driveKey', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }
    const body = request.body as { name?: string; remark?: string } | null

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      if (body && Object.prototype.hasOwnProperty.call(body, 'remark')) {
        const data = await updateOwnedDriveRemark(hyper, driveKey, body.remark)

        return {
          success: true,
          data,
        }
      }

      const data = await renameDrive(hyper, driveKey, body?.name ?? '')

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Drive 改名失败。',
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
