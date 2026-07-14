import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional } from 'class-validator'
import type { DriveContentType } from '@/modules/common/domain/drive-manifest'
import type { ProfileOwnerSummaryDto } from '@/modules/profile/domain/dto/profile.dto'

export class AddSubscribeDto {
  @ApiProperty({ description: '远端 Drive 公钥（64 位十六进制字符串）', example: 'abc123...' })
  @IsString()
  @IsNotEmpty()
  driveKey: string
}

export class UpdateSubscribeDto {
  @ApiPropertyOptional({ description: '备注内容', nullable: true })
  @IsOptional()
  @IsString()
  remark?: string | null
}

export interface SubscribeResponseDto {
  driveKey: string
  name?: string
  type: DriveContentType
  createdAt: number
  ownerProfileKey: string
  owner: ProfileOwnerSummaryDto
}
