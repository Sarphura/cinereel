import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MountService } from '../service/mount.service'
import { CreateMountJobDto } from '../domain/dto/mount.dto'

/**
 * MountController
 *
 * 路由：/api/mount
 *
 * 管理将本地文件系统目录挂载到 Drive 的异步任务。
 */
@ApiTags('mount')
@Controller('api/mount')
export class MountController {
  constructor(private readonly mountService: MountService) {}

  @Get()
  @ApiOperation({ summary: '列出所有挂载任务' })
  listJobs() {
    return { data: this.mountService.listJobs() }
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个挂载任务' })
  getJob(@Param('id') id: string) {
    return { data: this.mountService.getJob(id) }
  }

  @Post()
  @ApiOperation({ summary: '创建挂载任务（异步执行）' })
  async createJob(@Body() dto: CreateMountJobDto) {
    const data = await this.mountService.createJob(dto.driveKey, dto.targetPath)
    return { data }
  }
}
