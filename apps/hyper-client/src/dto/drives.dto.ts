import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

// Drive 响应 DTO。
export class DriveResponseDto {
  @ApiProperty({ description: '64 位十六进制 Drive key' })
  driveKey!: string

  @ApiProperty({ description: 'Drive 命名空间' })
  namespace!: string

  @ApiProperty({ description: 'Drive 名称' })
  name!: string

  @ApiProperty({ description: '是否为本地创建的 Drive' })
  isLocal!: boolean

  @ApiPropertyOptional({ description: '创建时间（ISO 8601）' })
  createdAt?: string
}

export class CreateDriveRequestDto {
  @ApiProperty({ description: 'Drive 命名空间' })
  @IsString()
  @MinLength(1)
  namespace!: string

  @ApiProperty({ description: 'Drive 名称' })
  @IsString()
  @MinLength(1)
  name!: string
}

export class RenameDriveRequestDto {
  @ApiProperty({ description: 'Drive 新名称' })
  @IsString()
  @MinLength(1)
  name!: string
}
