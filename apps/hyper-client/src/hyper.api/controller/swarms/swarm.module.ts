import { Module } from '@nestjs/common'
import { BootstrapModule } from '@hyper.domain/bootstrap/bootstrap.module.js'
import { SwarmController } from './swarm.controller.js'
import { IdentityController } from '../identity.controller.js'

@Module({
  imports: [BootstrapModule],
  controllers: [SwarmController, IdentityController],
})
export class SwarmModule {}
