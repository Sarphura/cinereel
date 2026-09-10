import { ApiProperty } from '@nestjs/swagger'

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'], description: '服务状态' })
  status!: 'ok'

  @ApiProperty({ type: Number, description: '已运行秒数' })
  uptime!: number
}
