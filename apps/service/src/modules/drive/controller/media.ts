import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../../base/hyper/types'
import { getDriveMediaIndex } from '../service'

export async function registerDriveMediaController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
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
}
