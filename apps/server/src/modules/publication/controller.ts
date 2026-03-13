import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import {
  deletePublishedResource,
  getPublishedResourceTree,
  listPublishedResources,
  renamePublishedResource,
} from './service'

export async function registerPublicationController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/publications', async () => {
    const data = await listPublishedResources(hyper.drive)

    return {
      success: true,
      data,
      total: data.length,
    }
  })

  app.patch('/api/publications/:id', async (request, reply) => {
    const params = request.params as { id: string }
    const body = request.body as { displayName?: string } | null

    if (!body?.displayName?.trim()) {
      return reply.code(400).send({ error: '请提供新的发布对象名称。' })
    }

    try {
      const data = await renamePublishedResource(
        hyper.drive,
        params.id,
        body.displayName,
      )

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '发布对象改名失败。',
      })
    }
  })

  app.get('/api/publications/:id/tree', async (request, reply) => {
    const params = request.params as { id: string }
    const data = await getPublishedResourceTree(hyper.drive, params.id)

    if (!data) {
      return reply.code(404).send({ error: '找不到对应的发布对象。' })
    }

    return {
      success: true,
      data,
    }
  })

  app.delete('/api/publications/:id', async (request, reply) => {
    const params = request.params as { id: string }

    try {
      const data = await deletePublishedResource(hyper.drive, params.id)

      return {
        success: true,
        data,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '发布对象删除失败。',
      })
    }
  })
}
