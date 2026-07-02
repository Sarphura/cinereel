import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator'

export type DriveContentType = 'movie' | 'series' | 'music' | 'generic'

/**
 * DriveRecord
 *
 * Drive 元数据——存储模型（用于 JSON 文件持久化）。
 * 字段设计遵循最小化原则，计算型字段（fileCount/totalSize 等）由查询时动态计算。
 */
export interface DriveRecord {
  /** Hyperdrive 公钥（十六进制字符串），同时作为记录的唯一标识 */
  id: string
  /** Drive 显示名称 */
  name: string
  /** Drive 内容类型 */
  type: DriveContentType
  /** 用户备注（可选） */
  remark?: string
  /** 是否为本地 owned drive（true=publish, false=subscribed） */
  isLocal: boolean
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class CreateDriveDto {
  @ApiProperty({ description: 'Drive 显示名称', example: '我的电影库' })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ description: 'Drive 内容类型', enum: ['movie', 'series', 'music', 'generic'] })
  @IsIn(['movie', 'series', 'music', 'generic'])
  type: DriveContentType
}

export class UpdateDriveDto {
  @ApiPropertyOptional({ description: '新的显示名称' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: '备注内容（传 null 可清除）', nullable: true })
  @IsOptional()
  @IsString()
  remark?: string | null
}

// ---------------------------------------------------------------------------
// Response DTOs（与前端 DriveRecord 类型对齐）
// ---------------------------------------------------------------------------

export interface DriveResponseDto {
  driveKey: string
  name: string
  type: DriveContentType
  remark?: string
  createdAt: number
  updatedAt: number
  fileCount: number
  totalSize: number
  publicationCount: number
  peerCount: number
  isLocal: boolean
}
