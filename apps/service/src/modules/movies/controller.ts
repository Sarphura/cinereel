import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../base/hyper/types'
import { listMovies } from './service'

export async function registerMoviesController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.get('/api/movies', async (request, reply) => {
    try {
      const data = await listMovies(hyper)

      return {
        success: true,
        data,
        total: data.length,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '电影索引读取失败。',
      })
    }
  })
}
