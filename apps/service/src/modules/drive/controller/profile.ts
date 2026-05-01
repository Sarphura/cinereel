import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../../base/hyper/types'
import { getDriveDescriptor } from '../service'
import { getProfileCollectionsByDriveKey, getProfileDocumentByDriveKey } from '../../profile/service'

export async function registerDriveProfileController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
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
}
