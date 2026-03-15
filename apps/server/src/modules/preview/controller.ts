import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { getDownloadedResourceTargetPath } from '../download/service'
import { getLocalPublishedResourceTargetPath } from '../drive/service'
import {
  buildRangePayload,
  buildTranscodeStreamPayload,
  getPreviewContentType,
  isRangePreviewableMedia,
  shouldStreamTranscodePreview,
} from './media'

export async function registerPreviewController(
  app: FastifyInstance,
  hyper: HyperModuleConfig,
) {
  app.route({
    method: ['GET', 'HEAD'],
    url: '/api/drives/:driveKey/preview',
    handler: async (request, reply) => {
      const { driveKey } = request.params as { driveKey?: string }
      const { resourcePath } = request.query as { resourcePath?: string }
      const isHeadRequest = request.method === 'HEAD'

      if (!driveKey || !resourcePath) {
        return reply.code(400).send({ error: '请提供 driveKey 和 resourcePath。' })
      }

      try {
        const targetPath = await getLocalPublishedResourceTargetPath(hyper, driveKey, resourcePath)
          ?? await getDownloadedResourceTargetPath(hyper, driveKey, resourcePath)

        if (!targetPath) {
          return reply.code(404).send({ error: '该资源尚未落地到本地，无法预览。' })
        }

        const stats = await fsp.stat(targetPath)

        if (!stats.isFile()) {
          return reply.code(400).send({ error: '仅支持文件预览。' })
        }

        const extension = path.extname(targetPath).toLowerCase()
        const contentType = getPreviewContentType(extension)

        if (!contentType) {
          return reply.code(415).send({ error: '当前文件类型暂不支持预览。' })
        }

        if (shouldStreamTranscodePreview(extension)) {
          if (isHeadRequest) {
            reply.header('Cache-Control', 'no-store')
            reply.header('Content-Type', 'video/mp4')
            return reply.code(200).send()
          }

          const payload = buildTranscodeStreamPayload(targetPath, request.log, () => {
            request.raw.destroy()
          })

          reply.code(200)
          Object.entries(payload.headers).forEach(([key, value]) => {
            reply.header(key, value)
          })

          request.raw.once('close', payload.close)
          reply.raw.once('close', payload.close)

          return reply.send(payload.stream)
        }

        if (isRangePreviewableMedia(extension)) {
          const payload = buildRangePayload(targetPath, stats.size, contentType, request.headers.range)

          reply.code(payload.statusCode)
          Object.entries(payload.headers).forEach(([key, value]) => {
            reply.header(key, value)
          })

          if (isHeadRequest) {
            return reply.send()
          }

          return reply.send(payload.stream)
        }

        reply.header('Content-Length', stats.size)
        reply.header('Content-Type', contentType)
        reply.header('Cache-Control', 'no-store')
        if (isHeadRequest) {
          return reply.send()
        }
        return reply.send(fs.createReadStream(targetPath))
      } catch (error) {
        request.log.error(error)

        return reply.code(400).send({
          error: error instanceof Error ? error.message : '预览加载失败。',
        })
      }
    },
  })
}
