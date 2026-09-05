import { Module, type Provider } from '@nestjs/common'
import { SDK } from 'hyper-sdk'
import { FileService } from '../../../hyper.implementation/file.service.js'
import { HyperSdkModule } from '../../../hyper.infrastructure/sdk/hyper-sdk.module.js'
import { FileController } from './file.controller.js'
import { ProtocolFileController } from './protocol-file.controller.js'
import { DriveActivity } from '../../../hyper.infrastructure/sdk/drive-activity.js'

const fileServiceProvider: Provider<FileService> = {
  provide: FileService,
  inject: [SDK, DriveActivity],
  useFactory: (sdk: SDK, activity: DriveActivity) => new FileService(sdk, activity),
}

@Module({
  imports: [HyperSdkModule],
  controllers: [FileController, ProtocolFileController],
  providers: [fileServiceProvider],
  exports: [FileService],
})
export class FileModule {}
