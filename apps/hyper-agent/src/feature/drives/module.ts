/**
 * DrivesModule — registers the DrivesController. Pulls services from
 * BootstrapModule (which is @Global so no need to import it here).
 */
import { Module } from '@nestjs/common'
import { BootstrapModule } from '../../bootstrap/bootstrap.module.js'
import { DrivesController } from './controller.js'
import { TestController } from './test.js'

@Module({
  imports: [BootstrapModule],
  controllers: [DrivesController, TestController],
})
export class DrivesModule {}
