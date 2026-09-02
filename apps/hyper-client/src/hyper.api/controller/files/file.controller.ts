import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  PayloadTooLargeException,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import type { Request } from 'express'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  FileService,
  type ListDirectoryResult,
} from '@hyper.implementation/file.service.js'
import {
  AddFileQueryDto,
  ListDirectoryQueryDto,
} from '../../dto/files.dto.js'

const DRIVE_KEY_PATTERN = /^[0-9a-f]{64}$/iu

@ApiTags('files')
@Controller('v1/files')
export class FileController {
  constructor(
    @Inject(FileService) private readonly fileService: FileService,
  ) {}

  @Get(':driveKey/entries')
  @ApiOperation({
    operationId: 'listDirectory',
    summary: '列出 Drive 目录的直接子项',
  })
  @ApiParam({ name: 'driveKey', description: '64 位十六进制 Drive key' })
  @ApiQuery({
    name: 'path',
    required: true,
    description: '要列出的规范 Drive 绝对目录路径',
    example: '/movies',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: '上一页最后一个子项的名称',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '单页子项数量，默认 100，最大 500',
    example: 100,
  })
  @ApiOkResponse({
    schema: {
      example: {
        path: '/movies',
        driveVersion: 42,
        entries: [
          {
            path: '/movies/action',
            name: 'action',
            type: 'directory',
            size: null,
          },
        ],
        nextCursor: null,
      },
    },
  })
  async listDirectory(
    @Param('driveKey') driveKey: string,
    @Query(new ZodValidationPipe(ListDirectoryQueryDto.schema))
    query: ListDirectoryQueryDto,
  ): Promise<ListDirectoryResult> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) {
      throw new BadRequestException('driveKey 必须是 64 位十六进制字符串。')
    }

    return this.fileService.listDirectory(
      driveKey,
      query.path,
      query.cursor,
      query.limit,
    )
  }

  @Put(':driveKey')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'addFile', summary: '向可写 Drive 增加文件' })
  @ApiConsumes('application/octet-stream')
  @ApiParam({ name: 'driveKey', description: '64 位十六进制 Drive key' })
  @ApiQuery({
    name: 'path',
    required: true,
    description: '要写入的目标文件路径（规范的 Drive 绝对路径，例如 /movies/file.txt）',
    example: '/movies/file.txt',
  })
  @ApiBody({
    description: '要写入的文件内容（application/octet-stream）',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiCreatedResponse({ schema: { example: { ok: true } } })
  async add(
    @Param('driveKey') driveKey: string,
    @Query(new ZodValidationPipe(AddFileQueryDto.schema)) query: AddFileQueryDto,
    @Req() request: Request,
  ): Promise<{ ok: true }> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) {
      throw new BadRequestException('driveKey 必须是 64 位十六进制字符串。')
    }

    const result = await this.fileService.addFile(
      driveKey,
      query.path,
      request,
    )

    switch (result) {
      case 'created':
        return { ok: true }
      case 'already-exists':
        throw new ConflictException('目标路径已经存在。')
      case 'drive-not-writable':
        throw new ForbiddenException('当前 Hyper Client 没有该 Drive 的写权限。')
      case 'file-too-large':
        throw new PayloadTooLargeException('文件不能超过 500 MiB。')
    }
  }
}
