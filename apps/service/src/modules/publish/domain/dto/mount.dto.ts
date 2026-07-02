import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

/**
 * MountJob
 *
 * 挂载任务存储模型。
 * 将本地文件系统目录内容挂载（同步）到指定 Hyperdrive。
 */
export interface MountJob {
  id: string
  driveKey: string
  targetPath: string
  mountedPath: string | null
  kind: 'file' | 'directory' | null
  totalFiles: number
  processedFiles: number
  totalBytes: number
  processedBytes: number
  currentFilePath: string | null
  progress: number
  status: 'queued' | 'mounting' | 'completed' | 'failed'
  error: string | null
  result: { publication: { id: string } } | null
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class CreateMountJobDto {
  @ApiProperty({ description: '目标 Drive 的公钥（十六进制）', example: 'abc123...' })
  @IsString()
  @IsNotEmpty()
  driveKey: string

  @ApiProperty({ description: '要挂载的本地目录绝对路径', example: '/Users/lynn/Movies' })
  @IsString()
  @IsNotEmpty()
  targetPath: string
}

// ---------------------------------------------------------------------------
// Response DTOs（与前端 MountJob 类型对齐）
// ---------------------------------------------------------------------------

export type MountJobResponseDto = MountJob
