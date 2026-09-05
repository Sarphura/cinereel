/** 注册 DrivesController 和 DriveService。 */
import { Module, type Provider } from '@nestjs/common'
import { SDK } from 'hyper-sdk'
import { DriveService } from '../../../hyper.implementation/drives.service.js'
import { HyperSdkModule } from '../../../hyper.infrastructure/sdk/hyper-sdk.module.js'
import { DrivesController } from './drives.controller.js'
import { DriveActivity } from '../../../hyper.infrastructure/sdk/drive-activity.js'

const driveServiceProvider: Provider<DriveService> = {
  provide: DriveService,
  inject: [SDK, DriveActivity],
  useFactory: (sdk: SDK, activity: DriveActivity) => new DriveService(sdk, activity),
}

@Module({
  imports: [HyperSdkModule],
  controllers: [DrivesController],
  providers: [driveServiceProvider],
})
export class DrivesModule {}
