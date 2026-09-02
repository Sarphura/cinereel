import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
} from '@nestjs/common'
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { Readable } from 'node:stream'
import { ZodValidationPipe } from 'nestjs-zod'
import { FileService } from '@hyper.implementation/file.service.js'
import { AddFileQueryDto } from '../../dto/files.dto.js'

const DRIVE_KEY_PATTERN = /^[0-9a-f]{64}$/iu

@ApiTags('files')
@Controller('v1/files')
export class FileController {
  constructor(
    @Inject(FileService) private readonly fileService: FileService,
  ) {}

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
    @Body() body: Buffer,
  ): Promise<{ ok: true }> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) {
      throw new BadRequestException('driveKey 必须是 64 位十六进制字符串。')
    }

    const content = Buffer.isBuffer(body) ? body : Buffer.alloc(0)
    const result = await this.fileService.addFile(
      driveKey,
      query.path,
      Readable.from(content),
    )

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
