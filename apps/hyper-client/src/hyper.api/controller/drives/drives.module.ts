/** 注册 DrivesController 和 DriveService。 */
import { Module } from '@nestjs/common'
import { DriveService } from '@hyper.implementation/drives.service.js'
import { HyperSdkModule } from '@hyper.infrastructure/sdk/hyper-sdk.module.js'
import { DrivesController } from './drives.controller.js'

@Module({
  imports: [HyperSdkModule],
  controllers: [DrivesController],
  providers: [DriveService],
})
export class DrivesModule {}
