import { Controller, Post, Delete, Patch, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { SubscribedDriveService } from '../service/subscribed-drive.service'
import { AddSubscribedDriveDto, UpdateSubscribedDriveDto } from '../domain/dto/subscribed-drive.dto'

/**
 * SubscribedDriveController
 *
 * 路由：/api/subscribed-drives
 *
 * 管理对远端 Drive 的订阅关系。
 * 注意：列表和文件树查询通过 /api/drives 统一提供（DriveController）。
 */
@ApiTags('subscribed-drives')
@Controller('api/subscribed-drives')
export class SubscribedDriveController {
  constructor(private readonly subscribedDriveService: SubscribedDriveService) {}

  @Post()
  @ApiOperation({ summary: '添加订阅（接入远端 Drive）' })
  async add(@Body() dto: AddSubscribedDriveDto) {
    const data = await this.subscribedDriveService.add(dto.driveKey)
    return { data }
  }

  @Delete(':driveKey')
  @ApiOperation({ summary: '取消订阅' })
  async remove(@Param('driveKey') driveKey: string) {
    await this.subscribedDriveService.remove(driveKey)
    return { data: { driveKey } }
  }

  @Patch(':driveKey')
  @ApiOperation({ summary: '更新订阅备注' })
  async updateRemark(
    @Param('driveKey') driveKey: string,
    @Body() dto: UpdateSubscribedDriveDto,
  ) {
    const data = await this.subscribedDriveService.updateRemark(driveKey, dto.remark)
    return { data }
  }
}
