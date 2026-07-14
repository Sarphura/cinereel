import { Controller, Post, Delete, Patch, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { SubscribeService } from '../service/subscribe.service'
import { AddSubscribeDto, UpdateSubscribeDto } from '../domain/dto/subscribe.dto'

/**
 * SubscribeController
 *
 * 路由：/api/subscribe
 *
 * 管理对远端 Drive 的订阅关系。
 * 注意：列表和文件树查询通过 /api/drives 统一提供（DriveController）。
 */
@ApiTags('subscribe')
@Controller('api/subscribe')
export class SubscribeController {
  constructor(private readonly subscribeService: SubscribeService) {}

  @Post()
  @ApiOperation({ summary: '添加订阅（接入远端 Drive）' })
  async add(@Body() dto: AddSubscribeDto) {
    const data = await this.subscribeService.add(dto.driveKey)
    return { data }
  }

  @Delete(':driveKey')
  @ApiOperation({ summary: '取消订阅' })
  async remove(@Param('driveKey') driveKey: string) {
    await this.subscribeService.remove(driveKey)
    return { data: { driveKey } }
  }

  @Patch(':driveKey')
  @ApiOperation({ summary: '更新订阅备注' })
  async updateRemark(
    @Param('driveKey') driveKey: string,
    @Body() dto: UpdateSubscribeDto,
  ) {
    const data = await this.subscribeService.updateRemark(driveKey, dto.remark)
    return { data }
  }
}
