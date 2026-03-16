import type { FastifyInstance } from 'fastify'
import { getScanJob, listScanJobs } from './service'

export async function registerScanController(app: FastifyInstance) {
  app.get('/api/scans', async () => ({
    success: true,
    data: listScanJobs(),
  }))

  app.get('/api/scans/:jobId', async (request, reply) => {
    const jobId = (request.params as { jobId: string }).jobId
    const job = getScanJob(jobId)

    if (!job) {
      return reply.code(404).send({ error: '找不到扫描任务。' })
    }

    return {
      success: true,
      data: job,
    }
  })
}
