import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import contentDisposition from 'content-disposition'
import { lookup } from 'mime-types'
import { basename } from 'node:path'
import { Readable } from 'node:stream'
import { FileReadError, FileService } from '../../service/file.service.js'
import type { FileReadResponse } from '../../service/file-read-response.js'
import type { DriveKeyParamsDto, ReadFileQueryDto } from '../../dto/files.dto.js'

// 可注入的响应写入器。controller 只负责路由与参数绑定，流式传输、
// Range 头部、断开清理、错误映射等 HTTP 传输逻辑集中于此，与领域逻辑解耦。
export abstract class FileResponseWriter {
  abstract write(
    params: DriveKeyParamsDto,
    query: ReadFileQueryDto,
    request: FastifyRequest,
    reply: FastifyReply,
    head: boolean,
  ): Promise<void>
}

@Injectable()
export class FastifyFileResponseWriter extends FileResponseWriter {
  constructor(private readonly files: FileService) {
    super()
  }

  async write(
    params: DriveKeyParamsDto,
    query: ReadFileQueryDto,
    request: FastifyRequest,
    reply: FastifyReply,
    head: boolean,
  ): Promise<void> {
    const cancellation = new AbortController()
    let handle: Awaited<ReturnType<FileService['readFile']>> | undefined
    let stream: Readable | undefined
    let streamed = false
    const disconnect = () => {
      if (!reply.raw.writableEnded) {
        cancellation.abort()
        stream?.destroy()
      }
    }
    request.raw.on('aborted', disconnect)
    reply.raw.on('close', disconnect)

    try {
      const range = head ? undefined : request.headers.range
      const ifRangeHeader = request.headers['if-range']
      const ifRange = typeof ifRangeHeader === 'string' ? ifRangeHeader : undefined

      handle = await this.files.readFile(params.driveKey, query.path, {
        driveVersion: query.driveVersion,
        rawRange: range,
        ifRange,
        signal: cancellation.signal,
      })

      if (head || handle.file.size === 0 || handle.status === 416) {
        this.writeHeaders(reply, handle, query.disposition)
        if (handle.status === 416) {
          reply.code(416)
          reply.header('Content-Range', `bytes */${handle.file.size}`)
          reply.header('Content-Length', 0)
        } else {
          reply.code(200)
        }
        reply.send()
        return
      }

      stream = handle.openStream()
      const iterator = stream[Symbol.asyncIterator]()
      // 首块就绪后才提交响应，保留缺块超时的 JSON 错误响应能力。
      const first = await iterator.next()
      cancellation.signal.throwIfAborted()
      if (first.done) {
        throw new HttpException('文件内容暂不可用。', HttpStatus.SERVICE_UNAVAILABLE)
      }

      reply.code(handle.status)
      this.writeHeaders(reply, handle, query.disposition)

      // 流结束或销毁后关闭会话。
      stream.once('close', () => { void handle?.close() })
      streamed = true

      // 「首块 + 剩余流」重组为单一 Readable，交给 Fastify 自动背压与销毁。
      const body = Readable.from((async function* () {
        try {
          yield first.value
          while (true) {
            const item = await iterator.next()
            if (item.done) return
            cancellation.signal.throwIfAborted()
            yield item.value
          }
        } finally {
          stream.destroy()
        }
      })())

      reply.send(body)
    } catch (error) {
      if (cancellation.signal.aborted || reply.raw.destroyed) return
      if (reply.raw.headersSent) {
        reply.raw.destroy(error instanceof Error ? error : undefined)
        return
      }
      if (error instanceof FileReadError) {
        throw new HttpException(
          { statusCode: error.status, code: error.code, message: error.message },
          error.status,
        )
      }
      throw error
    } finally {
      request.raw.off('aborted', disconnect)
      reply.raw.off('close', disconnect)
      if (!streamed) {
        stream?.destroy()
        await handle?.close()
      }
    }
  }

  private writeHeaders(
    reply: FastifyReply,
    result: FileReadResponse,
    disposition: 'inline' | 'attachment',
  ): void {
    const mime = lookup(result.file.path) || 'application/octet-stream'
    const contentType = mime.startsWith('text/') ? `${mime}; charset=utf-8` : mime
    let header = contentDisposition(basename(result.file.path))
    if (disposition === 'inline') {
      header = header.replace(/^attachment/u, 'inline')
    }
    reply.header('Content-Type', contentType)
    reply.header('Content-Disposition', header)
    reply.header('Accept-Ranges', 'bytes')
    reply.header('ETag', result.file.etag)
    reply.header('X-Drive-Version', String(result.driveVersion))
    reply.header('Content-Length', result.expectedBytes)
    if (result.range) {
      reply.header('Content-Range', `bytes ${result.range.start}-${result.range.end}/${result.file.size}`)
    }
  }
}
