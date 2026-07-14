import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import type { ProfileCollection } from '@/modules/common/domain/drive-manifest'

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '公开显示名称', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string

  @ApiPropertyOptional({ description: '公开简介', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string

  @ApiPropertyOptional({
    description: 'PNG/JPEG/WebP Data URL；传 null 删除头像',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  avatarDataUrl?: string | null
}

export interface ProfileOwnerSummaryDto {
  driveKey: string
  name: string
  bio: string
  avatarPath: string | null
  avatarUrl: string | null
  updatedAt: number
}

export interface ProfileResponseDto extends ProfileOwnerSummaryDto {
  collections: ProfileCollection[]
}
