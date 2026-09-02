/**
 * 提供 `/v1/drives` 下的 Drive 生命周期路由。
 * 文件操作由 `/v1/files/:driveKey` 下的 FileController 处理。
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { ZodValidationPipe } from 'nestjs-zod'
import { DriveService } from '@hyper.implementation/drives.service.js'
import {
  CreateDriveRequestDto,
  DriveResponseDto,
} from '../../dto/drives.dto.js'

@ApiTags('drives')
// @ApiBearerAuth(SECURITY_BEARER)
@Controller('v1/drives')
export class DrivesController {
  constructor(
    @Inject(DriveService) private readonly driveService: DriveService,
  ) {}

  @Get()
  @ApiOperation({ 
    operationId: 'listDrives',
    summary: '列出当前 Hyper Client 已知的所有 Drive',
  })
  @ApiOkResponse({ type: DriveResponseDto, isArray: true })
  list(): Promise<DriveResponseDto[]> {
    return this.driveService.getDrives()
  }

  @Post()
  @ApiOperation({
    operationId: 'createDrive',
    summary: '新建一个Drive',
  })
  @ApiBody({ type: CreateDriveRequestDto })
  @ApiOkResponse({ type: DriveResponseDto })
  async create(
    @Body(new ZodValidationPipe(CreateDriveRequestDto.schema))
    body: CreateDriveRequestDto,
  ): Promise<DriveResponseDto> {
    return this.driveService.createDrive(body)
  }

  @Delete(':key')
  @ApiOperation({ 
    operationId: 'removeDrive',
    summary: '根据 Drive Key 删除 Drive',
  })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async remove(@Param('key') key: string): Promise<{ ok: true }> {
    await this.driveService.deleteDrive(key)
    return { ok: true as const }
  }

  @Post(':key/mount')
  @ApiOperation({
    operationId: 'mountDrive',
    summary: '将此 Drive 加入 Swarm 并开始同步',
  })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async mount(@Param('key') key: string): Promise<{ ok: true }> {
    await this.driveService.mountDrive(key)
    return { ok: true as const }
  }

  @Post(':key/unmount')
  @ApiOperation({
    operationId: 'unmountDrive',
    summary: '将此 Drive 从 Swarm 中移除并停止同步',
  })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async unmount(@Param('key') key: string): Promise<{ ok: true }> {
    await this.driveService.unmountDrive(key)
    return { ok: true as const }
  }
}
