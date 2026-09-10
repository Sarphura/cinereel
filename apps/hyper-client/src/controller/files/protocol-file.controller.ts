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
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { IsString, ValidateBy } from 'class-validator'
import {
  FileReadError,
  FileService,
  isDriveFilePath,
  normalizeFileReadError,
} from '../../service/file.service.js'
import {
  MAX_RESERVED_FILE_SIZE,
  RESERVED_DIRECTORY_PATH,
  type ReservedFileWriteCondition,
} from '../../service/protocol.js'
import { DriveKeyParamsDto } from '../../dto/files.dto.js'

function isReservedFilePath(path: string): boolean {
  return isDriveFilePath(path) && path.startsWith(`${RESERVED_DIRECTORY_PATH}/`)
}

// 把普通校验函数包装成 class-validator 的 @ValidateBy 装饰器。
function validateBy(name: string, fn: (value: any) => boolean, message: string): PropertyDecorator {
  return ValidateBy({
    name,
    validator: {
      validate: (value: unknown) => fn(value),
      defaultMessage: () => message,
    },
  })
}

class ProtocolFileQueryDto {
  @ApiProperty({ description: '协议文件路径（必须位于 /.cinereel/ 内）' })
  @IsString()
  @validateBy('isReservedFilePath', isReservedFilePath, '协议文件必须位于 /.cinereel/ 目录内。')
  path!: string
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name]
  return typeof value === 'string' ? value : undefined
}

function writeCondition(request: FastifyRequest): ReservedFileWriteCondition {
  const ifMatch = header(request, 'if-match')
  const ifNoneMatch = header(request, 'if-none-match')
  if (ifMatch === undefined && ifNoneMatch === undefined) {
    throw new HttpException('协议写入必须携带 If-Match 或 If-None-Match。', 428)
  }
  if (ifNoneMatch === '*' && ifMatch === undefined) return { ifNoneMatch: '*' }
  if (ifNoneMatch === undefined && ifMatch !== undefined && /^"[\x21\x23-\x7e]+"$/u.test(ifMatch)) return { ifMatch }
  throw new BadRequestException('只能指定 If-None-Match: * 或单个强 If-Match ETag。')
}

async function readBody(request: FastifyRequest, signal: AbortSignal): Promise<Buffer> {
  const contentType = header(request, 'content-type')
  if (contentType === undefined || !contentType.toLowerCase().startsWith('application/octet-stream')) {
    throw new UnsupportedMediaTypeException('协议正文必须使用 application/octet-stream。')
  }
  const length = header(request, 'content-length')
  if (length !== undefined && Number(length) > MAX_RESERVED_FILE_SIZE) {
    throw new FileReadError('file-too-large', 413, '协议文件不能超过 64 KiB。')
  }
  const chunks: Buffer[] = []
  let size = 0
  const iterator = request.raw[Symbol.asyncIterator]()
  // 手动迭代且超限时不销毁流，保留连接以返回 413。
  while (true) {
    const { value, done } = await iterator.next()
    if (done) break
    signal.throwIfAborted()
    size += Buffer.byteLength(value)
    if (size > MAX_RESERVED_FILE_SIZE) throw new FileReadError('file-too-large', 413, '协议文件不能超过 64 KiB。')
    chunks.push(Buffer.from(value))
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
  async read(@Param() params: DriveKeyParamsDto, @Query() query: ProtocolFileQueryDto, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.withRequest(request, reply, async (signal) => {
      const file = await this.files.readReservedFile(params.driveKey, query.path, { signal })
      signal.throwIfAborted()
      reply.code(200)
      reply.header('Content-Type', 'application/octet-stream')
      reply.header('Content-Length', String(file.content.byteLength))
      reply.header('ETag', file.etag)
      reply.header('X-Drive-Version', String(file.driveVersion))
      reply.send(file.content)
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
  async write(@Param() params: DriveKeyParamsDto, @Query() query: ProtocolFileQueryDto, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.withRequest(request, reply, async (signal) => {
      const condition = writeCondition(request)
      const content = await readBody(request, signal)
      const result = await this.files.writeReservedFile(params.driveKey, query.path, content, condition, signal)
      signal.throwIfAborted()
      reply.code(result.created ? 201 : 200)
      reply.header('ETag', result.etag)
      reply.header('X-Drive-Version', String(result.driveVersion))
      reply.send()
    })
  }

  private async withRequest(request: FastifyRequest, reply: FastifyReply, action: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const cancellation = new AbortController()
    const disconnect = () => { if (!reply.raw.writableEnded) cancellation.abort() }
    request.raw.on('aborted', disconnect)
    reply.raw.on('close', disconnect)
    try {
      await action(cancellation.signal)
    } catch (error) {
      if (cancellation.signal.aborted || reply.raw.destroyed) return
      if (error instanceof HttpException) throw error
      const failure = normalizeFileReadError(error)
      throw new HttpException({ statusCode: failure.status, code: failure.code, message: failure.message }, failure.status)
    } finally {
      request.raw.off('aborted', disconnect)
      reply.raw.off('close', disconnect)
    }
  }
}
