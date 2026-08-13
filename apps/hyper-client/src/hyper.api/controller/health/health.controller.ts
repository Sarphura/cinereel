/**
 * HealthController — `GET /healthz` (public, no auth).
 */
import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { HealthResponseDto } from '../../dto/health.dto.js'

@ApiTags('health')
@Controller('healthz')
export class HealthController {
  private readonly startedAt = Date.now()

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  health(): HealthResponseDto {
    return {
      status: 'ok' as const,
      uptime: (Date.now() - this.startedAt) / 1000,
    }
  }
}
