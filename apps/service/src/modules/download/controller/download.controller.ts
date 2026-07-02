import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { DownloadService } from '../service/download.service'
import { CreateDownloadJobDto, DeleteDownloadDto } from '../domain/dto/download.dto'

/**
 * DownloadController
 *
 * 路由：/api/downloads
 *
 * 管理从远端 Drive 拉取文件到本地文件系统的任务。
 */
@ApiTags('downloads')
@Controller('api/downloads')
export class DownloadController {
  constructor(private readonly downloadService: DownloadService) {}

  @Get()
  @ApiOperation({ summary: '列出所有下载任务' })
  listJobs() {
    return { data: this.downloadService.listJobs() }
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个下载任务' })
  getJob(@Param('id') id: string) {
    return { data: this.downloadService.getJob(id) }
  }

  @Post()
  @ApiOperation({ summary: '创建下载任务（异步执行）' })
  async createJob(@Body() dto: CreateDownloadJobDto) {
    const data = await this.downloadService.createJob(dto)
    return { data }
  }

  @Delete()
  @ApiOperation({ summary: '删除本地已下载的资源' })
  async removeDownload(@Body() dto: DeleteDownloadDto) {
    await this.downloadService.removeDownload(dto.driveKey, dto.resourcePath)
    return { data: { driveKey: dto.driveKey, resourcePath: dto.resourcePath } }
  }
}
