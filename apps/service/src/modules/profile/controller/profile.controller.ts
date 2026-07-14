import { Body, Controller, Get, Param, Patch, Res } from '@nestjs/common'
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { UpdateProfileDto } from '../domain/dto/profile.dto'
import { ProfileService } from '../service/profile.service'

@ApiTags('profile')
@Controller('api/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: '读取本机 Profile Drive 的公开主页' })
  async getCurrentProfile() {
    return { data: await this.profileService.getCurrent() }
  }

  @Patch()
  @ApiOperation({ summary: '更新本机 Profile Drive 的公开主页' })
  async updateCurrentProfile(@Body() dto: UpdateProfileDto) {
    return { data: await this.profileService.update(dto) }
  }

  @Get('avatar')
  @ApiOperation({ summary: '读取本机 Profile Drive 中的头像' })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  async getAvatar(@Res({ passthrough: true }) reply: FastifyReply): Promise<Buffer> {
    const avatar = await this.profileService.getAvatar()
    reply.type(avatar.contentType)
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    return avatar.buffer
  }

  @Get(':profileKey/avatar')
  @ApiOperation({ summary: '按 Profile Drive key 读取头像（本机或远端）' })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  async getAvatarByKey(
    @Param('profileKey') profileKey: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const avatar = await this.profileService.getAvatarByDriveKey(profileKey)
    reply.type(avatar.contentType)
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    return avatar.buffer
  }

  @Get(':profileKey')
  @ApiOperation({ summary: '按 Profile Drive key 读取公开主页（本机或远端）' })
  async getProfileByKey(@Param('profileKey') profileKey: string) {
    return { data: await this.profileService.getByDriveKey(profileKey) }
  }
}
