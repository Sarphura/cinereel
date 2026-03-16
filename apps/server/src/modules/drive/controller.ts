import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { createCollectionDrive, deleteDrive, getDriveDescriptor, getDriveMediaIndex, getDriveTree, listDrives, refreshDriveFromSource, renameDrive, updateOwnedDriveRemark } from './service'
import { getProfileCollectionsByDriveKey, getProfileDocumentByDriveKey } from '../profile/service'

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

  app.get('/api/drives/:driveKey/descriptor', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const data = await getDriveDescriptor(hyper, driveKey)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '读取 Drive descriptor 失败。',
      })
    }
  })

  app.get('/api/drives/:driveKey/media-index', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }
    const { path } = (request.query as { path?: string } | undefined) ?? {}

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const data = await getDriveMediaIndex(hyper, driveKey, path)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '读取 Drive 媒体索引失败。',
      })
    }
  })

  app.get('/api/drives/:driveKey/profile/document', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const data = await getProfileDocumentByDriveKey(hyper, driveKey)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '读取 profile.json 失败。',
      })
    }
  })

  app.get('/api/drives/:driveKey/profile/collections', async (request, reply) => {
    const { driveKey } = request.params as { driveKey?: string }

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const data = await getProfileCollectionsByDriveKey(hyper, driveKey)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '读取 collections.json 失败。',
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
