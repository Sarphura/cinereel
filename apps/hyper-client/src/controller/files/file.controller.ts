import {
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Head,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Put,
  Query,
  Req,
  Res,
  applyDecorators,
} from '@nestjs/common'
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { FileService } from '../../service/file.service.js'
import { FileResponseWriter } from './file-response.writer.js'
import {
  AddFileQueryDto,
  AddFileResponseDto,
  DeleteDirectoryQueryDto,
  DeleteDirectoryResponseDto,
  DeleteFileQueryDto,
  DeleteFileResponseDto,
  DriveKeyParamsDto,
  ListDirectoryQueryDto,
  ListDirectoryResponseDto,
  ReadFileQueryDto,
} from '../../dto/files.dto.js'

function assertNever(value: never): never {
  throw new Error(`未处理的结果码: ${String(value)}`)
}

const fileHeaders = {
  'Content-Type': { schema: { type: 'string' } },
  'Content-Length': { schema: { type: 'integer' } },
  'Content-Disposition': { schema: { type: 'string' } },
  'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
  ETag: { schema: { type: 'string' } },
  'X-Drive-Version': { schema: { type: 'integer' } },
}

function ApiFileResponse(head: boolean) {
  const binaryContent = {
    'application/octet-stream': {
      schema: { type: 'string', format: 'binary' },
    },
  }
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: head ? '文件元数据，不返回正文' : '完整文件内容',
      headers: fileHeaders,
      ...(head ? {} : { content: binaryContent }),
    }),
    ...(head
      ? []
      : [
          ApiHeader({
            name: 'Range',
            required: false,
            description: '单段字节范围，例如 bytes=0-1023；非法格式、未知单位和多段范围忽略',
          }),
          ApiHeader({
            name: 'If-Range',
            required: false,
            description: '仅与当前 ETag 完全匹配时返回范围内容',
          }),
          ApiResponse({
            status: 206,
            description: '单段文件内容',
            headers: {
              ...fileHeaders,
              'Content-Range': { schema: { type: 'string' } },
            },
            content: binaryContent,
          }),
          ApiResponse({
            status: 416,
            description: '范围不可满足',
            headers: {
              'Content-Range': {
                schema: { type: 'string', example: 'bytes */100' },
              },
            },
          }),
        ]),
    ...[
      [400, '参数非法'],
      [404, '文件不存在'],
      [409, '目标为目录或符号链接'],
      [503, '文件内容暂不可用'],
      [504, '等待元数据或文件块超时'],
    ].map(([status, description]) =>
      ApiResponse({ status: Number(status), description: String(description) }),
    ),
  )
}

@ApiTags('files')
@Controller('v1/files')
export class FileController {
  constructor(
    @Inject(FileService) private readonly fileService: FileService,
    @Inject(FileResponseWriter) private readonly writer: FileResponseWriter,
  ) {}

  // Fastify 默认不把 HEAD 匹配到 GET，因此独立注册元数据路由。
  @Head(':driveKey')
  @ApiOperation({ operationId: 'headFile', summary: '读取文件元数据' })
  @ApiFileResponse(true)
  async head(
    @Param() params: DriveKeyParamsDto,
    @Query() query: ReadFileQueryDto,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.writer.write(params, query, request, reply, true)
  }

  @Get(':driveKey')
  @ApiOperation({ operationId: 'readFile', summary: '流式读取、下载或播放文件' })
  @ApiFileResponse(false)
  async read(
    @Param() params: DriveKeyParamsDto,
    @Query() query: ReadFileQueryDto,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.writer.write(params, query, request, reply, false)
  }

  @Get(':driveKey/entries')
  @ApiOperation({
    operationId: 'listDirectory',
    summary: '列出 Drive 目录的直接子项',
  })
  @ApiOkResponse({ type: ListDirectoryResponseDto })
  async listDirectory(
    @Param() params: DriveKeyParamsDto,
    @Query() query: ListDirectoryQueryDto,
  ) {
    return this.fileService.listDirectory(
      params.driveKey,
      query.path,
      query.cursor,
      query.limit,
    )
  }

  @Put(':driveKey')
  @ApiOperation({ operationId: 'addFile', summary: '向可写 Drive 增加文件' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({
    description: '要写入的文件内容（application/octet-stream）',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiCreatedResponse({ type: AddFileResponseDto })
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Param() params: DriveKeyParamsDto,
    @Query() query: AddFileQueryDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.fileService.addFile(
      params.driveKey,
      query.path,
      request.raw,
    )
    switch (result) {
      case 'created':
        return { ok: true as const }
      case 'already-exists':
        throw new ConflictException('目标路径已经存在。')
      case 'drive-not-writable':
        throw new ForbiddenException('当前 Hyper Client 没有该 Drive 的写权限。')
      case 'file-too-large':
        throw new PayloadTooLargeException('文件不能超过 500 MiB。')
      default:
        return assertNever(result)
    }
  }

  @Delete(':driveKey')
  @ApiOperation({ operationId: 'deleteFile', summary: '从可写 Drive 删除文件' })
  @ApiOkResponse({ type: DeleteFileResponseDto })
  async delete(
    @Param() params: DriveKeyParamsDto,
    @Query() query: DeleteFileQueryDto,
  ) {
    const result = await this.fileService.deleteFile(params.driveKey, query.path)
    switch (result) {
      case 'deleted':
        return { ok: true as const }
      case 'not-found':
        throw new NotFoundException('目标路径不存在。')
      case 'drive-not-writable':
        throw new ForbiddenException('当前 Hyper Client 没有该 Drive 的写权限。')
      default:
        return assertNever(result)
    }
  }

  @Delete(':driveKey/entries')
  @ApiOperation({
    operationId: 'deleteDirectory',
    summary: '递归删除 Drive 目录',
  })
  @ApiOkResponse({ type: DeleteDirectoryResponseDto })
  async deleteDirectory(
    @Param() params: DriveKeyParamsDto,
    @Query() query: DeleteDirectoryQueryDto,
  ) {
    const result = await this.fileService.deleteDirectory(
      params.driveKey,
      query.path,
    )
    switch (result) {
      case 'deleted':
        return { ok: true as const }
      case 'drive-not-writable':
        throw new ForbiddenException('当前 Hyper Client 没有该 Drive 的写权限。')
      default:
        return assertNever(result)
    }
  }
}
