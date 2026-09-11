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
import { DriveFileService } from '../../service/file/drivefile.service.js'

function assertNever(value: never): never {
  throw new Error(`未处理的结果码: ${String(value)}`)
}


@ApiTags('files')
@Controller('v1/files')
export class FileController {
  constructor(
    @Inject(DriveFileService) private readonly fileService: DriveFileService,
  ) {}

  // @Get(':driveKey/entries')
  // @ApiOperation({
  //   operationId: 'listDirectory',
  //   summary: '列出 Drive 目录的直接子项',
  // })
  // @ApiOkResponse({ type: ListDirectoryResponseDto })
  // async listDirectory(
  //   @Param() params: DriveKeyParamsDto,
  //   @Query() query: ListDirectoryQueryDto,
  // ) {
  //   return this.fileService.listDirectory(
  //     params.driveKey,
  //     query.path,
  //     query.cursor,
  //     query.limit,
  //   )
  // }

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
    return result
  }

  @Delete(':driveKey')
  @ApiOperation({ operationId: 'deleteFile', summary: '从可写 Drive 删除文件' })
  @ApiOkResponse({ type: DeleteFileResponseDto })
  async delete(
    @Param() params: DriveKeyParamsDto,
    @Query() query: DeleteFileQueryDto,
  ) {
    const result = await this.fileService.deleteFile(params.driveKey, query.path)
    return result
  }
}
