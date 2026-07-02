import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional } from 'class-validator'

/**
 * DownloadJob
 *
 * 下载任务存储模型。
 * 从订阅的远端 Drive 拉取文件/目录到本地文件系统。
 */
export interface DownloadJob {
  id: string
  driveKey: string
  resourcePath: string
  targetDir: string
  targetPath: string
  kind: 'file' | 'directory'
  fileName: string
  totalFiles: number
  downloadedFiles: number
  totalBytes: number
  downloadedBytes: number
  currentFileName: string | null
  progress: number
  status: 'queued' | 'downloading' | 'completed' | 'failed'
  error: string | null
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class CreateDownloadJobDto {
  @ApiProperty({ description: '源 Drive 公钥（十六进制）' })
  @IsString()
  @IsNotEmpty()
  driveKey: string

  @ApiProperty({ description: 'Drive 内的资源路径', example: '/movies/big-buck-bunny.mp4' })
  @IsString()
  @IsNotEmpty()
  resourcePath: string

  @ApiProperty({ description: '本地下载目标目录', example: '/Users/lynn/Downloads' })
  @IsString()
  @IsNotEmpty()
  targetDir: string

  @ApiPropertyOptional({ description: '保存文件名（不传则使用资源原始名）' })
  @IsOptional()
  @IsString()
  targetName?: string
}

export class DeleteDownloadDto {
  @ApiProperty({ description: '源 Drive 公钥' })
  @IsString()
  @IsNotEmpty()
  driveKey: string

  @ApiProperty({ description: 'Drive 内的资源路径' })
  @IsString()
  @IsNotEmpty()
  resourcePath: string
}
