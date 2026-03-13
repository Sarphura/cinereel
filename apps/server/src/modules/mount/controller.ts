import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { mountLocalPath } from './service'
import { openWritableDrive } from '../drive/service'

export async function registerMountController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.post('/api/mount', async (request, reply) => {
    const body = request.body as { targetPath?: string; displayName?: string; driveKey?: string } | null

    if (!body?.targetPath) {
      return reply.code(400).send({ error: '请提供挂载目录。' })
    }

    try {
      const { drive, close } = await openWritableDrive(hyper, body.driveKey)

      try {
        const result = await mountLocalPath(drive, body.targetPath, body.displayName)

        return {
          success: true,
          data: result,
        }
      } finally {
        await close()
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(500).send({
        error: error instanceof Error ? error.message : '挂载失败。',
      })
    }
  })
}
