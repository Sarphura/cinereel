import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { getStreamPayload, listLibraryEntries } from './service'

export async function registerLibraryController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/library', async () => {
    const entries = await listLibraryEntries(hyper.drive)

    return {
      success: true,
      data: entries,
      total: entries.length,
    }
  })

  app.get('/api/stream/*', async (request, reply) => {
    const filepath = `/${(request.params as { '*': string })['*']}`
    const payload = await getStreamPayload(hyper.drive, filepath, request.headers.range)

    if (!payload) {
      return reply.code(404).send({ error: '找不到该文件，可能尚未同步完成。' })
    }

    reply.code(payload.statusCode)

    for (const [header, value] of Object.entries(payload.headers)) {
      reply.header(header, value)
    }

    return reply.send(payload.stream)
  })
}
