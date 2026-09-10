import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
} from 'class-validator'
import {
  isDriveDirectoryPath,
  MAX_DRIVE_FILE_PATH_LENGTH,
} from '../service/file.service.js'

// 把普通校验函数包装成 class-validator 的 @ValidateBy 装饰器。
function validateBy(name: string, fn: (value: any) => boolean, message: string): PropertyDecorator {
  return ValidateBy({
    name,
    validator: {
      validate: (value: unknown) => fn(value),
      defaultMessage: () => message,
    },
  })
}

export class CreateDownloadTaskDto {
  @ApiProperty({ description: '64 位十六进制 Drive key', pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/iu)
  driveKey!: string

  @ApiProperty({ description: '规范的 Drive 绝对路径（文件或目录）' })
  @IsString()
  @MaxLength(MAX_DRIVE_FILE_PATH_LENGTH)
  @validateBy('isDriveDirectoryPath', isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对路径。')
  path!: string

  @ApiProperty({ enum: ['file', 'directory'], description: '任务目标类型' })
  @IsIn(['file', 'directory'])
  targetType!: 'file' | 'directory'

  @ApiPropertyOptional({ description: '固定读取的 Drive 版本', type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  driveVersion?: number
}

export class DownloadErrorDto {
  @ApiProperty()
  code!: string

  @ApiProperty()
  message!: string
}

export class DownloadTaskResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty()
  driveKey!: string

  @ApiProperty()
  path!: string

  @ApiProperty({ enum: ['file', 'directory'] })
  targetType!: 'file' | 'directory'

  @ApiProperty({ type: Number, nullable: true })
  driveVersion!: number | null

  @ApiProperty({ type: Number, nullable: true })
  driveFork!: number | null

  @ApiProperty({ type: Number, nullable: true })
  contentFork!: number | null

  @ApiProperty({ enum: ['queued', 'running', 'paused', 'completed', 'failed', 'canceled'] })
  status!: string

  @ApiProperty({ type: Number, nullable: true })
  totalFiles!: number | null

  @ApiProperty({ type: Number, nullable: true })
  totalBytes!: number | null

  @ApiProperty({ type: Number })
  processedFiles!: number

  @ApiProperty({ type: Number })
  processedBytes!: number

  @ApiProperty({ type: Number })
  skippedEntries!: number

  @ApiProperty({ type: String, nullable: true })
  currentPath!: string | null

  @ApiProperty({ type: Number })
  retryCount!: number

  @ApiProperty({ type: String, nullable: true })
  nextRetryAt!: string | null

  @ApiProperty({ type: () => DownloadErrorDto, nullable: true })
  error!: DownloadErrorDto | null

  @ApiProperty()
  createdAt!: string

  @ApiProperty()
  updatedAt!: string
}

export class DownloadTaskParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string
}

export class ListDownloadTasksQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: '上一页最后一个任务 ID' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUUID()
  cursor?: string

  @ApiPropertyOptional({ type: Number, default: 100, description: '单页任务数量', minimum: 1, maximum: 500 })
  @Transform(({ value }) => (value === '' || value === undefined ? 100 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 100
}

export class ListDownloadTasksResponseDto {
  @ApiProperty({ type: [DownloadTaskResponseDto] })
  tasks!: DownloadTaskResponseDto[]

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  nextCursor!: string | null
}
