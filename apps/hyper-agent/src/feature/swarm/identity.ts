/**
 * IdentityController — `GET /v1/identity`.
 */
import {
  Controller,
  Get,
  Inject,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SwarmService } from '../../services/swarm.service.js'
import { IdentityInfoDto } from './dto/index.js'
import { SECURITY_BEARER } from '../../core/swagger/security.constants.js'

@ApiTags('identity')
@ApiBearerAuth(SECURITY_BEARER)
@Controller('v1/identity')
export class IdentityController {
  constructor(@Inject(SwarmService) private readonly swarm: SwarmService) {}

  @Get()
  @ApiOperation({ operationId: 'identity' })
  @ApiOkResponse({ type: IdentityInfoDto })
  identity(): IdentityInfoDto {
    return this.swarm.identity() as IdentityInfoDto
  }
}
