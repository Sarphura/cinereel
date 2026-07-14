import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator'
import type { DriveContentType } from '@/modules/common/domain/drive-manifest'

export type { DriveContentType } from '@/modules/common/domain/drive-manifest'

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
  /**
   * Corestore 命名空间（仅本地 drive 有此字段）。
   * 用于应用重启后通过 store.namespace(namespace) 重新打开同一个 Drive。
   * 使用 UUID v4 生成，保证唯一性。
   */
  namespace?: string
  /** 资源所有者的 Profile Drive 公钥；本地资源库创建时写入 */
  ownerProfileKey?: string
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

  @ApiPropertyOptional({
    description: '新的内容类型',
    enum: ['movie', 'series', 'music', 'generic'],
  })
  @IsOptional()
  @IsIn(['movie', 'series', 'music', 'generic'])
  type?: DriveContentType

  @ApiPropertyOptional({ description: '备注内容（传 null 可清除）', nullable: true })
  @IsOptional()
  @IsString()
  remark?: string | null
}

export class MoveFileDto {
  @ApiProperty({ description: 'Drive 内的源路径', example: '/old/name.mkv' })
  @IsString()
  @IsNotEmpty()
  from: string

  @ApiProperty({ description: 'Drive 内的目标路径', example: '/new/name.mkv' })
  @IsString()
  @IsNotEmpty()
  to: string
}

export class CopyFileDto {
  @ApiProperty({ description: 'Drive 内的源路径', example: '/movies/a.mkv' })
  @IsString()
  @IsNotEmpty()
  from: string

  @ApiProperty({ description: 'Drive 内的目标路径', example: '/movies/copy-of-a.mkv' })
  @IsString()
  @IsNotEmpty()
  to: string
}

export class CreateFolderDto {
  @ApiProperty({ description: '要创建的 drive 内目录路径', example: '/movies/新建文件夹' })
  @IsString()
  @IsNotEmpty()
  path: string
}

export class DeleteFileDto {
  @ApiProperty({ description: '要删除的 drive 内路径（文件或目录）', example: '/movies/old.mkv' })
  @IsString()
  @IsNotEmpty()
  path: string
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
  ownerProfileKey?: string
}
