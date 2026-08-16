/**
 * DrivesController — `/v1/drives` HTTP routes.
 *
 * Handles drive lifecycle operations: list, create, remove.
 * All file operations (read, write, delete, tree, entry) live in
 * `/v1/files/:driveKey/*` (FilesController).
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
import { DRIVE_SERVICE } from './drives.tokens.js'
import {
  CreateDriveRequestDto,
  DriveResponseDto,
} from '../../dto/drives.dto.js'

@ApiTags('drives')
// @ApiBearerAuth(SECURITY_BEARER)
@Controller('v1/drives')
export class DrivesController {
  constructor(
    @Inject(DRIVE_SERVICE) 
    private readonly driveService: DriveService
  ) {
    
  }
    
  @Get()
  @ApiOperation({ operationId: 'listDrives' })
  @ApiOkResponse({ type: DriveResponseDto, isArray: true })
  list(): Promise<DriveResponseDto[]> {
    return this.driveService.getDrives()
  }

  @Post()
  @ApiOperation({ 
    operationId: 'createDrive',
    summary: '创建新的 Hyperdrive'
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
  @ApiOperation({ operationId: 'removeDrive' })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async remove(@Param('key') key: string): Promise<{ ok: true }> {
    await this.driveService.deleteDrive(key)
    return { ok: true as const }
  }

  @Post(':key/mount')
  @ApiOperation({ 
    operationId: 'mountDrive',
    summary: '加入 swarm 开始同步此 drive'
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
    summary: '离开 swarm 停止同步此 drive'
  })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async unmount(@Param('key') key: string): Promise<{ ok: true }> {
    await this.driveService.unmountDrive(key)
    return { ok: true as const }
  }
}
