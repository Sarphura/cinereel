import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { createMountJob, getMountJob, listMountJobs } from './service'

export async function registerMountController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.post('/api/mount', async (request, reply) => {
    const body = request.body as { targetPath?: string; driveKey?: string } | null

    if (!body?.targetPath) {
      return reply.code(400).send({ error: '请提供挂载目录。' })
    }

    try {
      const job = await createMountJob(hyper, body.driveKey ?? '', body.targetPath)

      return {
        success: true,
        data: job,
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '创建挂载任务失败。',
      })
    }
  })

  app.get('/api/mount', async () => ({
    success: true,
    data: listMountJobs(),
  }))

  app.get('/api/mount/:jobId', async (request, reply) => {
    const jobId = (request.params as { jobId: string }).jobId
    const job = getMountJob(jobId)

    if (!job) {
      return reply.code(404).send({ error: '找不到挂载任务。' })
    }

    return {
      success: true,
      data: job,
    }
  })
}
