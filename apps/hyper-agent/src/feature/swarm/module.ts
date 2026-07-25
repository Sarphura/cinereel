import { Module } from '@nestjs/common'
import { BootstrapModule } from '../../bootstrap/bootstrap.module.js'
import { SwarmController } from './controller.js'
import { IdentityController } from './identity.js'

@Module({
  imports: [BootstrapModule],
  controllers: [SwarmController, IdentityController],
})
export class SwarmModule {}
