import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Put,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { FileReadError, FileService, isDriveFilePath, normalizeFileReadError } from '../../../hyper.implementation/file.service.js'
import { MAX_PROTOCOL_FILE_SIZE, PROTOCOL_DIRECTORY_PATH, type ProtocolWriteCondition } from '../../../hyper.implementation/protocol-file.js'
import { DriveKeyParamsDto } from '../../dto/files.dto.js'

class ProtocolFileQueryDto extends createZodDto(z.object({
  path: z.string().refine(
    (path) => isDriveFilePath(path) && path.startsWith(`${PROTOCOL_DIRECTORY_PATH}/`),
    '协议文件必须位于 /.cinereel/ 目录内。',
  ),
})) {}

function writeCondition(request: Request): ProtocolWriteCondition {
  const ifMatch = request.get('If-Match')
  const ifNoneMatch = request.get('If-None-Match')
  if (ifMatch === undefined && ifNoneMatch === undefined) {
    throw new HttpException('协议写入必须携带 If-Match 或 If-None-Match。', 428)
  }
  if (ifNoneMatch === '*' && ifMatch === undefined) return { ifNoneMatch: '*' }
  if (ifNoneMatch === undefined && ifMatch !== undefined && /^"[\x21\x23-\x7e]+"$/u.test(ifMatch)) return { ifMatch }
  throw new BadRequestException('只能指定 If-None-Match: * 或单个强 If-Match ETag。')
}

async function readBody(request: Request, signal: AbortSignal): Promise<Buffer> {
  if (!request.is('application/octet-stream')) throw new UnsupportedMediaTypeException('协议正文必须使用 application/octet-stream。')
  const length = request.get('Content-Length')
  if (length !== undefined && Number(length) > MAX_PROTOCOL_FILE_SIZE) {
    throw new FileReadError('file-too-large', 413, '协议文件不能超过 64 KiB。')
  }
  const chunks: Buffer[] = []
  let size = 0
  // destroyOnReturn=false 保留超大请求的连接，仍可向调用方返回 413。
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    signal.throwIfAborted()
    size += Buffer.byteLength(chunk)
    if (size > MAX_PROTOCOL_FILE_SIZE) throw new FileReadError('file-too-large', 413, '协议文件不能超过 64 KiB。')
    chunks.push(Buffer.from(chunk))
  }
  signal.throwIfAborted()
  return Buffer.concat(chunks)
}

const versionHeaders = {
  ETag: { schema: { type: 'string' } },
  'X-Drive-Version': { schema: { type: 'integer' } },
}

@ApiTags('protocol-files')
@Controller('v1/protocol-files')
export class ProtocolFileController {
  constructor(@Inject(FileService) private readonly files: FileService) {}

  @Get(':driveKey')
  @ApiOperation({ operationId: 'readProtocolFile', summary: '读取保留目录内的协议文件' })
  @ApiResponse({ status: 200, headers: versionHeaders, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 404, description: '协议文件不存在' })
  @ApiResponse({ status: 409, description: '目标或父路径被目录、文件或符号链接占用' })
  @ApiResponse({ status: 413, description: '协议文件超过 64 KiB' })
  @ApiResponse({ status: 503, description: '指定版本内容暂不可用' })
  @ApiResponse({ status: 504, description: '读取远端元数据或正文超时' })
  async read(@Param() params: DriveKeyParamsDto, @Query() query: ProtocolFileQueryDto, @Req() request: Request, @Res() response: Response): Promise<void> {
    await this.withRequest(request, response, async (signal) => {
      const file = await this.files.readProtocolFile(params.driveKey, query.path, { signal })
      signal.throwIfAborted()
      response.status(200).set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(file.content.byteLength),
        ETag: file.etag,
        'X-Drive-Version': String(file.driveVersion),
      }).end(file.content)
    })
  }

  @Put(':driveKey')
  @ApiOperation({ operationId: 'writeProtocolFile', summary: '条件创建或原子替换保留目录内的协议文件' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiHeader({ name: 'If-None-Match', required: false, description: '* 表示仅创建' })
  @ApiHeader({ name: 'If-Match', required: false, description: '读取所得的单个强 ETag，与 If-None-Match 二选一' })
  @ApiResponse({ status: 200, description: '替换成功', headers: versionHeaders })
  @ApiResponse({ status: 201, description: '创建成功', headers: versionHeaders })
  @ApiResponse({ status: 403, description: '没有写权限' })
  @ApiResponse({ status: 409, description: '路径冲突' })
  @ApiResponse({ status: 412, description: '写入预条件失败' })
  @ApiResponse({ status: 413, description: '协议文件超过 64 KiB' })
  @ApiResponse({ status: 428, description: '未提供写入预条件' })
  async write(@Param() params: DriveKeyParamsDto, @Query() query: ProtocolFileQueryDto, @Req() request: Request, @Res() response: Response): Promise<void> {
    await this.withRequest(request, response, async (signal) => {
      const condition = writeCondition(request)
      const content = await readBody(request, signal)
      const result = await this.files.writeProtocolFile(params.driveKey, query.path, content, condition, signal)
      signal.throwIfAborted()
      response.status(result.created ? 201 : 200).set({ ETag: result.etag, 'X-Drive-Version': String(result.driveVersion) }).end()
    })
  }

  private async withRequest(request: Request, response: Response, action: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const cancellation = new AbortController()
    const disconnect = () => { if (!response.writableFinished) cancellation.abort() }
    request.on('aborted', disconnect)
    response.on('close', disconnect)
    try {
      await action(cancellation.signal)
    } catch (error) {
      if (cancellation.signal.aborted || response.destroyed) return
      if (error instanceof HttpException) throw error
      const failure = normalizeFileReadError(error)
      throw new HttpException({ statusCode: failure.status, code: failure.code, message: failure.message }, failure.status)
    } finally {
      request.off('aborted', disconnect)
      response.off('close', disconnect)
    }
  }
}
