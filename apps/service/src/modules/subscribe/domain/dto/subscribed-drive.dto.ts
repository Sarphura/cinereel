import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional } from 'class-validator'

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class AddSubscribedDriveDto {
  @ApiProperty({ description: '远端 Drive 公钥（64 位十六进制字符串）', example: 'abc123...' })
  @IsString()
  @IsNotEmpty()
  driveKey: string
}

export class UpdateSubscribedDriveDto {
  @ApiPropertyOptional({ description: '备注内容', nullable: true })
  @IsOptional()
  @IsString()
  remark?: string | null
}

// ---------------------------------------------------------------------------
// Response DTOs（与前端 addSubscribedDrive 返回值对齐）
// ---------------------------------------------------------------------------

export interface SubscribedDriveResponseDto {
  driveKey: string
  name?: string
  type: string
  createdAt: number
}
