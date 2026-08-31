import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import {
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import type { Request } from 'express'
import { ZodValidationPipe } from 'nestjs-zod'
import { FileService } from '@hyper.implementation/file.service.js'
import { AddFileQueryDto } from '../../dto/files.dto.js'

const DRIVE_KEY_PATTERN = /^[0-9a-f]{64}$/iu

@ApiTags('files')
@Controller('v1/files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Put(':driveKey')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'addFile', summary: '向可写 Drive 增加文件' })
  @ApiConsumes('application/octet-stream')
  @ApiParam({ name: 'driveKey', description: '64 位十六进制 Drive key' })
  @ApiCreatedResponse({ schema: { example: { ok: true } } })
  async add(
    @Param('driveKey') driveKey: string,
    @Query(new ZodValidationPipe(AddFileQueryDto.schema)) query: AddFileQueryDto,
    @Req() request: Request,
  ): Promise<{ ok: true }> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) {
      throw new BadRequestException('driveKey 必须是 64 位十六进制字符串。')
    }

    const result = await this.fileService.addFile(driveKey, query.path, request)

    switch (result) {
      case 'created':
        return { ok: true }
      case 'already-exists':
        throw new ConflictException('目标路径已经存在。')
      case 'drive-not-writable':
        throw new ForbiddenException('当前 Hyper Client 没有该 Drive 的写权限。')
    }
  }
}
