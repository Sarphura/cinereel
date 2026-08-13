/**
 * DrivesModule — registers the DrivesController. Pulls services from
 * BootstrapModule (which is @Global so no need to import it here).
 */
import { Module } from '@nestjs/common'
import { BootstrapModule } from '../../../hyper.domain/bootstrap/bootstrap.module.js'
import { DrivesController } from './drives.controller.js'
import { TestController } from './drives-test.controller.js'

@Module({
  imports: [BootstrapModule],
  controllers: [DrivesController, TestController],
})
export class DrivesModule {}
