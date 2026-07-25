/**
 * FilesController — `GET /v1/files/:driveKey/*` (ticket 11, ADR 0047).
 *
 * Range-aware streaming for trailer playback. Path-parameter style: the
 * catch-all segment after `:driveKey` is the file path inside the drive.
 * The endpoint honours the `Range` header per RFC 9110, returning 200
 * for full bodies, 206 for partial, 416 for unsatisfiable / multi-range,
 * and 400 for malformed input. ProblemDetails is RFC 9457 throughout.
 *
 * This is the only read path on the Hyper Agent. Writes and deletes
 * remain on `DrivesController` (`PUT`/`DELETE /v1/drives/:key/file`).
 */
import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Req,
  Res,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { Transform } from 'node:stream'
import { FileService } from '../../services/files.service.js'
import { SECURITY_BEARER } from '../../core/swagger/security.constants.js'
import { parseRange } from '../../infrastructure/http/range.js'
import { contentTypeForPath } from '../../infrastructure/http/content-type.js'
import {
  INVALID_RANGE,
  INVALID_DRIVE_KEY,
  DRIVE_NOT_MOUNTED,
  RANGE_NOT_SATISFIABLE,
  MULTI_RANGE_NOT_SUPPORTED,
  HttpProblem,
} from '../../infrastructure/errors/index.js'
import { HEX64 } from '../../infrastructure/types/key.js'

@ApiTags('files')
@ApiBearerAuth(SECURITY_BEARER)
@Controller('v1/files')
export class FilesController {
  constructor(@Inject(FileService) private readonly files: FileService) {}

  /**
   * `GET /v1/files/:driveKey/<rest...>` with optional `Range` header.
   *
   * Express exposes the splat as `req.params[0]`; we read it directly
   * because NestJS's `Param('splat')` decorator does not bind the
   * route's `'*'` wildcard.
   */
  @Get(':driveKey/*')
  @ApiOperation({ operationId: 'readFileRange' })
  @ApiParam({ name: 'driveKey', description: 'Hex64 drive key' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({
    schema: { type: 'string', format: 'binary' },
    headers: {
      'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
      'Cache-Control': {
        schema: {
          type: 'string',
          example: 'public, max-age=31536000, immutable',
        },
      },
      'Content-Range': {
        schema: { type: 'string', example: 'bytes 0-499/1000' },
      },
    },
  })
  async readRange(
    @Param('driveKey') driveKey: string,
    @Headers('range') rangeHeader: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!HEX64.test(driveKey)) {
      throw new HttpProblem(INVALID_DRIVE_KEY, `driveKey is not hex64: ${driveKey.slice(0, 16)}`)
    }

    // NestJS exposes the splat under `path` as a string array; the
    // string-indexed array path is not populated because NestJS
    // introspects the route's wildcard differently.
    const splatRaw = (req.params as Record<string, unknown>)['path']
    const splat = Array.isArray(splatRaw)
      ? splatRaw.join('/')
      : typeof splatRaw === 'string'
        ? splatRaw
        : ((req.params as Record<string, string | undefined>)[0] ?? '')
    const target = splat.length === 0 ? '/' : '/' + splat.replace(/^\/+/, '')

    const { size, mounted } = await this.resolveSize(driveKey, target)
    if (!mounted) {
      throw new HttpProblem(DRIVE_NOT_MOUNTED, `drive ${driveKey} is not mounted`)
    }

    const spec = parseRange(rangeHeader, size)

    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Content-Type', contentTypeForPath(target))

    if (spec.kind === 'none') {
      const stream = await this.files.readStream(driveKey, target, true)
      res.setHeader('Content-Length', String(size))
      res.status(200)
      await pipeAll(stream, res)
      return
    }

    if (spec.kind === 'malformed') {
      throw new HttpProblem(INVALID_RANGE, spec.reason)
    }

    if (spec.kind === 'multi') {
      res.setHeader('Content-Range', `bytes */${size}`)
      throw new HttpProblem(MULTI_RANGE_NOT_SUPPORTED, 'multi-range requests are not supported')
    }

    if (spec.kind === 'invalid') {
      res.setHeader('Content-Range', `bytes */${size}`)
      throw new HttpProblem(RANGE_NOT_SATISFIABLE, spec.reason)
    }

    // spec.kind === 'single'
    const { start, end } = spec
    const length = end - start + 1
    res.status(206)
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
    res.setHeader('Content-Length', String(length))
    const stream = await this.files.readStream(driveKey, target, true)
    const sliced = sliceStream(stream, start, end)
    await pipeAll(sliced, res)
  }

  /**
   * Resolve the drive and the file's stat. Returns the size and
   * whether the drive is mounted so the caller can map "no drive" to
   * a ProblemDetails even when the stat is empty.
   */
  private async resolveSize(
    driveKey: string,
    path: string,
  ): Promise<{ size: number; mounted: boolean }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = this.files as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let drive: any
    try {
      drive = svc.get(driveKey)
    } catch (err) {
      if (err instanceof Error && /invalid driveKey/.test(err.message)) {
        throw new HttpProblem(INVALID_DRIVE_KEY, err.message)
      }
      // DriveNotMountedError (or similar) — the drive key is well-formed
      // but the drive is not in the registry.
      throw new HttpProblem(DRIVE_NOT_MOUNTED, `drive ${driveKey} is not mounted`)
    }
    const stat = await drive.stat(path)
    const size = typeof stat?.size === 'number' ? stat.size : 0
    return { size, mounted: true }
  }
}

/**
 * Stream every byte from `src` into `dst`. Resolves on `finish`, rejects on
 * `error`. Used by both the full-body and the ranged response paths.
 */
function pipeAll(
  src: NodeJS.ReadableStream,
  dst: NodeJS.WritableStream,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    src.on('error', reject)
    dst.on('error', reject)
    dst.on('finish', () => resolve())
    src.pipe(dst)
  })
}

/**
 * Wrap a Hyperdrive read stream and emit only the byte slice
 * `[start, end]` (inclusive) on the `data` events. The wrapper tracks
 * its own absolute byte offset based on the chunks it consumes because
 * the Hyperdrive read stream does not expose a public `.pos` counter.
 *
 * `Transform` is the right primitive: chunks arrive asynchronously and
 * we cannot assume a single chunk equals one byte. We slice on the
 * chunk boundary and end the stream as soon as we've consumed the
 * last byte of the requested range.
 */
function sliceStream(
  src: NodeJS.ReadableStream,
  start: number,
  end: number,
): NodeJS.ReadableStream {
  let consumed = 0
  const t = new Transform({
    transform(
      chunk: Buffer | string,
      _enc: BufferEncoding,
      cb: (err?: Error | null, data?: Buffer) => void,
    ): void {
      const buf =
        typeof chunk === 'string'
          ? Buffer.from(chunk)
          : Buffer.from(chunk as Uint8Array)
      const chunkStart = consumed
      consumed += buf.length

      const sliceStart = Math.max(0, start - chunkStart)
      const sliceEnd = Math.max(0, end - chunkStart + 1)
      if (sliceStart >= buf.length) {
        cb()
        return
      }
      const out = buf.subarray(sliceStart, Math.min(buf.length, sliceEnd))
      cb(null, out.length > 0 ? out : Buffer.alloc(0))
      if (consumed > end) {
        // Force the stream to end so the consumer doesn't hang waiting
        // for the upstream Hyperdrive stream to finish.
        t.end()
      }
    },
  })

  // Forward upstream errors so the controller's `pipeAll` rejects.
  src.on('error', (err: Error) => t.destroy(err))
  src.pipe(t)
  return t
}
