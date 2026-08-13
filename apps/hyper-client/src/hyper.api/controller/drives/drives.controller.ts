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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { ZodValidationPipe } from 'nestjs-zod'
import { DriveService } from '../../../hyper.domain/model/drives.service.js'
import {
  CreateDriveBodyDto,
  DriveDescriptorDto,
} from '../../dto/drives.dto.js'
import { SECURITY_BEARER } from '../../swagger/security.constants.js'

@ApiTags('drives')
@ApiBearerAuth(SECURITY_BEARER)
@Controller('v1/drives')
export class DrivesController {
  constructor(@Inject(DriveService) private readonly drives: DriveService) {}

  // ── CRUD ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ operationId: 'listDrives' })
  @ApiOkResponse({ type: DriveDescriptorDto, isArray: true })
  list(): Promise<DriveDescriptorDto[]> {
    return this.drives.list() as unknown as Promise<DriveDescriptorDto[]>
  }

  @Post()
  @ApiOperation({ operationId: 'createDrive' })
  @ApiOkResponse({ type: DriveDescriptorDto })
  async create(
    @Body(new ZodValidationPipe(CreateDriveBodyDto.schema))
    body: CreateDriveBodyDto,
  ): Promise<DriveDescriptorDto> {
    const desc = await this.drives.create(body.name, body.type)
    return desc as DriveDescriptorDto
  }

  @Delete(':key')
  @ApiOperation({ operationId: 'removeDrive' })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async remove(@Param('key') key: string): Promise<{ ok: true }> {
    await this.drives.remove(key)
    return { ok: true as const }
  }
}
