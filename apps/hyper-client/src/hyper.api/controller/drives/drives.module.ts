/** 注册 DrivesController 和 DriveService。 */
import { Module, type Provider } from '@nestjs/common'
import { SDK } from 'hyper-sdk'
import { DriveService } from '@hyper.implementation/drives.service.js'
import { HyperSdkModule } from '@hyper.infrastructure/sdk/hyper-sdk.module.js'
import { DrivesController } from './drives.controller.js'

const driveServiceProvider: Provider<DriveService> = {
  provide: DriveService,
  inject: [SDK],
  useFactory: (sdk: SDK) => new DriveService(sdk),
}

@Module({
  imports: [HyperSdkModule],
  controllers: [DrivesController],
  providers: [driveServiceProvider],
})
export class DrivesModule {}
