/**
 * DrivesController — `/v1/drives*` HTTP routes.
 *
 * The legacy `GET /v1/drives/:key/file?path=` read route was removed
 * in ticket 13. Reads now go through `/v1/files/:driveKey/*` (ADR
 * 0047). Writes and deletes remain on this controller because their
 * semantics (binary PUT body, recursive DELETE) still match the
 * file-shaped path.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { ZodValidationPipe } from 'nestjs-zod'
import { DriveService } from '../../services/drives.service.js'
import { FileService } from '../../services/files.service.js'
import {
  CreateDriveBodyDto,
  DriveDescriptorDto,
  FileDeleteQueryDto,
  FileWriteQueryDto,
  HyperdriveEntryDto,
  PathQueryDto,
  TreeQueryDto,
} from './dto/index.js'
import { SECURITY_BEARER } from '../../core/swagger/security.constants.js'
import { RawBody } from '../../core/common/decorators/raw-body.decorator.js'

@ApiTags('drives')
@ApiBearerAuth(SECURITY_BEARER)
@Controller('v1/drives')
export class DrivesController {
  constructor(
    @Inject(DriveService) private readonly drives: DriveService,
    @Inject(FileService) private readonly files: FileService,
  ) {}

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

  // ── drive/:key/tree ──────────────────────────────────────────────

  @Get(':key/tree')
  @ApiOperation({ operationId: 'driveTree' })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  async tree(
    @Param('key') key: string,
    @Query(new ZodValidationPipe(TreeQueryDto.schema)) q: TreeQueryDto,
  ) {
    return this.files.getTree(key, q.prefix, q.wait ?? true)
  }

  // ── drive/:key/entry ─────────────────────────────────────────────

  @Get(':key/entry')
  @ApiOperation({ operationId: 'driveEntry' })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  @ApiOkResponse({ type: HyperdriveEntryDto })
  async entry(
    @Param('key') key: string,
    @Query(new ZodValidationPipe(PathQueryDto.schema)) q: PathQueryDto,
  ): Promise<HyperdriveEntryDto | null> {
    const out = await this.files.getEntry(key, q.path, q.wait ?? true)
    return (out ?? null) as HyperdriveEntryDto | null
  }

  // ── drive/:key/file (write / delete only) ───────────────────────
  // Reads live at /v1/files/:driveKey/* (ticket 11).

  @Put(':key/file')
  @ApiOperation({ operationId: 'driveWriteFile' })
  @ApiConsumes('application/octet-stream')
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  @ApiOkResponse({ schema: { example: { ok: true, byteLength: 0 } } })
  async writeFile(
    @Param('key') key: string,
    @Query(new ZodValidationPipe(FileWriteQueryDto.schema)) q: FileWriteQueryDto,
    @RawBody() body: Buffer,
    @Headers('x-metadata') metaHdr?: string,
  ): Promise<{ ok: true; byteLength: number }> {
    const metadata =
      typeof metaHdr === 'string' && metaHdr.length > 0 ? JSON.parse(metaHdr) : undefined
    return this.files.write(key, q.path, body, metadata)
  }

  @Delete(':key/file')
  @ApiOperation({ operationId: 'driveDeleteEntry' })
  @ApiParam({ name: 'key', description: 'Hex64 drive key' })
  async deleteEntry(
    @Param('key') key: string,
    @Query(new ZodValidationPipe(FileDeleteQueryDto.schema)) q: FileDeleteQueryDto,
  ): Promise<{ ok: true }> {
    return this.files.deleteEntry(key, q.path, q.recursive ?? false)
  }
}
