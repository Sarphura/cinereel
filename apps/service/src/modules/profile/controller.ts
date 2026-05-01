import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../base/hyper/types'
import {
  ensureProfileIdentity,
  getCurrentProfile,
  getCurrentProfileCollections,
  getCurrentProfileDocument,
  resolveProfileAvatarUrl,
  updateCurrentProfile,
} from './service'

export async function registerProfileController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  await ensureProfileIdentity(hyper)

  app.get('/api/profile', async () => {
    const data = await getCurrentProfile(hyper)

    return {
      success: true,
      data: {
        ...data,
        avatarUrl: resolveProfileAvatarUrl(data.avatarPath, data.updatedAt),
      },
    }
  })

  app.get('/api/profile/document', async () => {
    const data = await getCurrentProfileDocument(hyper)

    return {
      success: true,
      data,
    }
  })

  app.get('/api/profile/collections', async () => {
    const data = await getCurrentProfileCollections(hyper)

    return {
      success: true,
      data,
    }
  })

  app.patch('/api/profile', async (request, reply) => {
    const body = request.body as {
      name?: string
      bio?: string
      avatarDataUrl?: string | null
    } | null

    try {
      const data = await updateCurrentProfile(hyper, {
        name: body?.name,
        bio: body?.bio,
        avatarDataUrl: Object.prototype.hasOwnProperty.call(body ?? {}, 'avatarDataUrl')
          ? body?.avatarDataUrl ?? null
          : undefined,
      })

      return {
        success: true,
        data: {
          ...data,
          avatarUrl: resolveProfileAvatarUrl(data.avatarPath, data.updatedAt),
        },
      }
    } catch (error) {
      request.log.error(error)

      return reply.code(400).send({
        error: error instanceof Error ? error.message : '更新个人资料失败。',
      })
    }
  })
}
