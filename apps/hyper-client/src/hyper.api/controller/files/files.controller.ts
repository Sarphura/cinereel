import {
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { Transform } from 'node:stream'
import { ZodValidationPipe } from 'nestjs-zod'
import { FileService } from '@hyper.implementation/files.service.js'
import { SECURITY_BEARER } from '../../swagger/security.constants.js'
import { parseRange } from '@hyper.infrastructure/http/range.js'
import { contentTypeForPath } from '@hyper.infrastructure/http/content-type.js'
import {
  INVALID_RANGE,
  INVALID_DRIVE_KEY,
  DRIVE_NOT_MOUNTED,
  RANGE_NOT_SATISFIABLE,
  MULTI_RANGE_NOT_SUPPORTED,
  HttpProblem,
} from '@hyper.infrastructure/errors/index.js'
import { HEX64 } from '@hyper.infrastructure/types/key.js'
import {
  DeleteFileRequestDto,
  PathQueryDto,
  GetTreeRequestDto,
} from '../../dto/files.dto.js'
import { DriveEntryResponseDto } from '../../dto/drives.dto.js'
import { RawBody } from '../../decorators/raw-body.decorator.js'

@ApiTags('files')
@ApiBearerAuth(SECURITY_BEARER)
@Controller('v1/files')
export class FilesController {
  constructor(@Inject(FileService) private readonly files: FileService) {}

  // ── GET :driveKey/ (tree listing) ───────────────────────────────────

  @Get(':driveKey/')
  @ApiOperation({ operationId: 'tree' })
  @ApiParam({ name: 'driveKey', description: 'Hex64 drive key' })
  async tree(
    @Param('driveKey') driveKey: string,
    @Query(new ZodValidationPipe(GetTreeRequestDto.schema)) q: GetTreeRequestDto,
  ) {
    return this.files.getTree(driveKey, q.prefix, q.wait ?? true)
  }

  // ── HEAD :driveKey/* (entry metadata) ────────────────────────────────

  @Get(':driveKey/~entry')
  @ApiOperation({ operationId: 'entry' })
  @ApiParam({ name: 'driveKey', description: 'Hex64 drive key' })
  @ApiOkResponse({ type: DriveEntryResponseDto })
  async entry(
    @Param('driveKey') driveKey: string,
    @Query(new ZodValidationPipe(PathQueryDto.schema)) q: PathQueryDto,
  ): Promise<DriveEntryResponseDto | null> {
    const out = await this.files.getEntry(driveKey, q.path, q.wait ?? true)
    return (out ?? null) as DriveEntryResponseDto | null
  }

  // ── PUT :driveKey/* (write file) ─────────────────────────────────────

  @Put(':driveKey/*')
  @ApiOperation({ operationId: 'writeFile' })
  @ApiConsumes('application/octet-stream')
  @ApiParam({ name: 'driveKey', description: 'Hex64 drive key' })
  @ApiOkResponse({ schema: { example: { ok: true, byteLength: 0 } } })
  async writeFile(
    @Param('driveKey') driveKey: string,
    @Req() req: Request,
    @RawBody() body: Buffer,
    @Headers('x-metadata') metaHdr?: string,
  ): Promise<{ ok: true; byteLength: number }> {
    const splat = this.extractSplat(req)
    const metadata =
      typeof metaHdr === 'string' && metaHdr.length > 0 ? JSON.parse(metaHdr) : undefined
    return this.files.write(driveKey, splat, body, metadata)
  }

  // ── DELETE :driveKey/* (delete file/directory) ───────────────────────

  @Delete(':driveKey/*')
  @ApiOperation({ operationId: 'deleteEntry' })
  @ApiParam({ name: 'driveKey', description: 'Hex64 drive key' })
  async deleteEntry(
    @Param('driveKey') driveKey: string,
    @Query(new ZodValidationPipe(DeleteFileRequestDto.schema)) q: DeleteFileRequestDto,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const splat = this.extractSplat(req)
    return this.files.deleteEntry(driveKey, splat, q.recursive ?? false)
  }

  // ── GET :driveKey/* (read file with Range support) ───────────────────

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

    const target = this.extractSplat(req)

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
   * Extract the splat (catch-all) segment from Express route `/:driveKey/*`.
   *
   * NestJS exposes the splat under `path` as a string array; the
   * string-indexed array path is not populated because NestJS
   * introspects the route's wildcard differently.
   */
  private extractSplat(req: Request): string {
    const splatRaw = (req.params as Record<string, unknown>)['path']
    const splat = Array.isArray(splatRaw)
      ? splatRaw.join('/')
      : typeof splatRaw === 'string'
        ? splatRaw
        : ((req.params as Record<string, string | undefined>)[0] ?? '')
    return splat.length === 0 ? '/' : '/' + splat.replace(/^\/+/, '')
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
