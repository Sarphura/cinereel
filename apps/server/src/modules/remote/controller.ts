import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { fetchRemoteLibrary, getPeerDrive } from './service'
import { listPublishedResources } from '../publication/service'

export async function registerRemoteController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.post('/api/remote/library', async (request, reply) => {
    const body = request.body as { driveKey?: string; key?: string } | null
    const driveKey = body?.driveKey ?? body?.key

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      return await fetchRemoteLibrary(hyper, driveKey)
    } catch (error) {
      request.log.error(error)

      return reply.code(500).send({
        error: error instanceof Error ? error.message : '拉取远端资料库失败。',
      })
    }
  })

  app.post('/api/remote/publications', async (request, reply) => {
    const body = request.body as { driveKey?: string; key?: string } | null
    const driveKey = body?.driveKey ?? body?.key

    if (!driveKey) {
      return reply.code(400).send({ error: '请提供 driveKey。' })
    }

    try {
      const remote = await fetchRemoteLibrary(hyper, driveKey)
      const peerDrive = await getPeerDrive(hyper, driveKey)
      const data = await listPublishedResources(peerDrive)

      return {
        success: true,
        data,
        total: data.length,
        fallback: data.length === 0 && remote.total > 0,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(500).send({
        error: error instanceof Error ? error.message : '拉取远端发布目录失败。',
      })
    }
  })
}
