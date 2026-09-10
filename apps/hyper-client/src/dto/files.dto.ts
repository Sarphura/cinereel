import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
} from 'class-validator'
import {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  isDriveDirectoryPath,
  isDriveFilePath,
  isDrivePathSegment,
  MAX_DIRECTORY_PAGE_SIZE,
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

export class ReadFileQueryDto {
  @ApiProperty({ description: '要读取的规范 Drive 绝对文件路径' })
  @IsString()
  @MaxLength(MAX_DRIVE_FILE_PATH_LENGTH)
  @validateBy('isDriveDirectoryPath', isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对路径。')
  path!: string

  @ApiPropertyOptional({ description: '固定读取的 Drive 版本；省略时使用本次取得的版本', type: Number })
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  driveVersion?: number

  @ApiPropertyOptional({ enum: ['inline', 'attachment'], default: 'inline', description: 'inline 用于预览或播放，attachment 用于下载' })
  @IsIn(['inline', 'attachment'])
  disposition: 'inline' | 'attachment' = 'inline'
}

export class AddFileQueryDto {
  @ApiProperty({ description: '要写入的规范 Drive 绝对文件路径，例如 /movies/file.txt' })
  @IsString()
  @MaxLength(MAX_DRIVE_FILE_PATH_LENGTH)
  @validateBy('isDriveFilePath', isDriveFilePath, 'path 必须是规范的 Drive 绝对文件路径。')
  path!: string
}

export class DeleteFileQueryDto {
  @ApiProperty({ description: '要删除的规范 Drive 绝对文件路径，例如 /movies/file.txt' })
  @IsString()
  @MaxLength(MAX_DRIVE_FILE_PATH_LENGTH)
  @validateBy('isDriveFilePath', isDriveFilePath, 'path 必须是规范的 Drive 绝对文件路径。')
  path!: string
}

export class DeleteDirectoryQueryDto {
  @ApiProperty({ description: '要递归删除的规范 Drive 绝对目录路径，例如 /movies 或 /' })
  @IsString()
  @MaxLength(MAX_DRIVE_FILE_PATH_LENGTH)
  @validateBy('isDriveDirectoryPath', isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对目录路径。')
  path!: string
}

export class DriveKeyParamsDto {
  @ApiProperty({ description: '64 位十六进制 Drive key', pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/iu, { message: 'driveKey 必须是 64 位十六进制字符串。' })
  driveKey!: string
}

export class ListDirectoryQueryDto {
  @ApiProperty({ description: '要列出的规范 Drive 绝对目录路径，例如 /movies' })
  @IsString()
  @MaxLength(MAX_DRIVE_FILE_PATH_LENGTH)
  @validateBy('isDriveDirectoryPath', isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对目录路径。')
  path!: string

  @ApiPropertyOptional({ description: '上一页最后一个子项的名称' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @validateBy('isDrivePathSegment', isDrivePathSegment, 'cursor 必须是有效的目录子项名称。')
  cursor?: string

  @ApiPropertyOptional({ description: '单页子项数量', type: Number, default: DEFAULT_DIRECTORY_PAGE_SIZE, minimum: 1, maximum: MAX_DIRECTORY_PAGE_SIZE })
  @Transform(({ value }) => (value === '' || value === undefined ? DEFAULT_DIRECTORY_PAGE_SIZE : Number(value)))
  @IsInt()
  @Min(1)
  @Max(MAX_DIRECTORY_PAGE_SIZE)
  limit: number = DEFAULT_DIRECTORY_PAGE_SIZE
}

export class DirectoryEntryResponseDto {
  @ApiProperty()
  path!: string

  @ApiProperty()
  name!: string

  @ApiProperty({ enum: ['file', 'directory', 'symlink'] })
  type!: 'file' | 'directory' | 'symlink'

  @ApiProperty({ type: Number, nullable: true })
  size!: number | null
}

export class ListDirectoryResponseDto {
  @ApiProperty()
  path!: string

  @ApiProperty({ type: Number })
  driveVersion!: number

  @ApiProperty({ type: [DirectoryEntryResponseDto] })
  entries!: DirectoryEntryResponseDto[]

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null
}

export class AddFileResponseDto {
  @ApiProperty({ enum: [true] })
  ok!: true
}

export class DeleteFileResponseDto {
  @ApiProperty({ enum: [true] })
  ok!: true
}

export class DeleteDirectoryResponseDto {
  @ApiProperty({ enum: [true] })
  ok!: true
}
