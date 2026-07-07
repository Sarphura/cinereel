import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { DriveService } from '../service/drive.service'
import {
  CreateDriveDto,
  UpdateDriveDto,
  MoveFileDto,
  CopyFileDto,
  CreateFolderDto,
  DeleteFileDto,
} from '../domain/dto/drive.dto'

/**
 * DriveController
 *
 * 路由：/api/drives
 *
 * 提供 Drive 元数据的增删改查，以及文件树读取。
 * 同时服务本地（isLocal=true）和订阅（isLocal=false）两种类型的 drive，
 * 前端通过 filterDrivesByScope() 在客户端按 isLocal 过滤。
 */
@ApiTags('drives')
@Controller('api/drives')
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Get()
  @ApiOperation({ summary: '列出所有 drives（含本地和订阅）' })
  async listDrives() {
    const data = await this.driveService.listAll()
    return { data }
  }

  @Post()
  @ApiOperation({ summary: '创建本地 Drive' })
  async createDrive(@Body() dto: CreateDriveDto) {
    const data = await this.driveService.create(dto)
    return { data }
  }

  @Patch(':driveKey')
  @ApiOperation({ summary: '更新 Drive（重命名 / 修改备注）' })
  async updateDrive(
    @Param('driveKey') driveKey: string,
    @Body() dto: UpdateDriveDto,
  ) {
    const data = await this.driveService.update(driveKey, dto)
    return { data }
  }

  @Delete(':driveKey')
  @ApiOperation({ summary: '删除本地 Drive' })
  async deleteDrive(@Param('driveKey') driveKey: string) {
    await this.driveService.delete(driveKey)
    return { data: { driveKey } }
  }

  @Get(':driveKey/tree')
  @ApiOperation({ summary: '读取 Drive 文件树' })
  async getDriveTree(@Param('driveKey') driveKey: string) {
    const data = await this.driveService.getTree(driveKey)
    return { data }
  }

  @Post(':driveKey/refresh')
  @ApiOperation({ summary: '强制同步并返回最新文件树' })
  async refreshDriveTree(@Param('driveKey') driveKey: string) {
    const data = await this.driveService.refreshTree(driveKey)
    return { data }
  }

  @Post(':driveKey/files/move')
  @ApiOperation({ summary: '移动/重命名 Drive 内的文件或目录（get+put+del）' })
  async moveFile(
    @Param('driveKey') driveKey: string,
    @Body() dto: MoveFileDto,
  ) {
    await this.driveService.moveFile(driveKey, dto)
    return { data: { from: dto.from, to: dto.to } }
  }

  @Post(':driveKey/files/copy')
  @ApiOperation({ summary: '复制 Drive 内的文件或目录（get+put）' })
  async copyFile(
    @Param('driveKey') driveKey: string,
    @Body() dto: CopyFileDto,
  ) {
    await this.driveService.copyFile(driveKey, dto)
    return { data: { from: dto.from, to: dto.to } }
  }

  @Post(':driveKey/files/folder')
  @ApiOperation({ summary: '在 Drive 内创建新目录' })
  async createFolder(
    @Param('driveKey') driveKey: string,
    @Body() dto: CreateFolderDto,
  ) {
    await this.driveService.createFolder(driveKey, dto)
    return { data: { path: dto.path } }
  }

  @Delete(':driveKey/files')
  @ApiOperation({ summary: '删除 Drive 内的文件或目录' })
  async deleteFile(
    @Param('driveKey') driveKey: string,
    @Body() dto: DeleteFileDto,
  ) {
    await this.driveService.deleteFile(driveKey, dto)
    return { data: { path: dto.path } }
  }
}
