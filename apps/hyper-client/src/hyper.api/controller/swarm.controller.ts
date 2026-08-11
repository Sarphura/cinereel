/**
 * SwarmController — `/v1/swarm/*` HTTP routes.
 */
import { Controller, Get, Inject, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { ZodValidationPipe } from 'nestjs-zod'
import { SwarmService } from '../../hyper.domain/model/swarm.service.js'
import { PeerInfoDto } from '../dto/swarm.dto.js'
import { SECURITY_BEARER } from '../swagger/security.constants.js'
import { BodyOptional } from '../decorators/body-optional.decorator.js'

@ApiTags('swarm')
@ApiBearerAuth(SECURITY_BEARER)
@Controller('v1/swarm')
export class SwarmController {
  constructor(@Inject(SwarmService) private readonly swarm: SwarmService) {}

  @Post('announce')
  @ApiOperation({ operationId: 'swarmAnnounce' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async announce(
    @BodyOptional() body?: { wait?: boolean },
  ): Promise<{ ok: true }> {
    const wait = body?.wait ?? true
    await this.swarm.announce(wait)
    return { ok: true as const }
  }

  @Get('peers')
  @ApiOperation({ operationId: 'swarmPeers' })
  @ApiOkResponse({ type: PeerInfoDto, isArray: true })
  peers(): PeerInfoDto[] {
    return this.swarm.getPeers() as unknown as PeerInfoDto[]
  }

  @Post('mount/:publicKey')
  @ApiOperation({ operationId: 'swarmMount' })
  @ApiParam({ name: 'publicKey', description: 'Hex64 public key' })
  @ApiOkResponse({ schema: { example: { driveKey: 'a'.repeat(64) } } })
  mount(@Param('publicKey') publicKey: string): Promise<{ driveKey: string }> {
    return this.swarm.mount(publicKey)
  }

  @Post('unmount/:publicKey')
  @ApiOperation({ operationId: 'swarmUnmount' })
  @ApiParam({ name: 'publicKey', description: 'Hex64 public key' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async unmount(@Param('publicKey') publicKey: string): Promise<{ ok: true }> {
    await this.swarm.unmount(publicKey)
    return { ok: true as const }
  }
}
