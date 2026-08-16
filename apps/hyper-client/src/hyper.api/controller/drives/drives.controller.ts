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
import { DriveService } from '@hyper.domain/obsolete/drives.service.js'
import {
  CreateDriveRequestDto,
  DriveDto,
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
  @ApiOkResponse({ type: DriveDto, isArray: true })
  list(): Promise<DriveDto[]> {
    return this.drives.list() as unknown as Promise<DriveDto[]>
  }

  @Post()
  @ApiOperation({ operationId: 'createDrive' })
  @ApiOkResponse({ type: DriveDto })
  async create(
    @Body(new ZodValidationPipe(CreateDriveRequestDto.schema))
    body: CreateDriveRequestDto,
  ): Promise<DriveDto> {
    const desc = await this.drives.create(body.name, body.type)
    return desc as DriveDto
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
