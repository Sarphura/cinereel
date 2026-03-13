import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { createDownloadJob, getDownloadJob } from './service'

export async function registerDownloadController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.post('/api/downloads', async (request, reply) => {
    const body = request.body as {
      driveKey?: string
      resourcePath?: string
      targetDir?: string
    } | null

    if (!body?.driveKey || !body.resourcePath || !body.targetDir) {
      return reply.code(400).send({ error: '请提供 driveKey、resourcePath 和 targetDir。' })
    }

    try {
      const job = await createDownloadJob(hyper, body.driveKey, body.resourcePath, body.targetDir)

      return {
        success: true,
        data: job,
      }
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : '创建下载任务失败。',
      })
    }
  })

  app.get('/api/downloads/:jobId', async (request, reply) => {
    const jobId = (request.params as { jobId: string }).jobId
    const job = getDownloadJob(jobId)

    if (!job) {
      return reply.code(404).send({ error: '找不到下载任务。' })
    }

    return {
      success: true,
      data: job,
    }
  })
}
