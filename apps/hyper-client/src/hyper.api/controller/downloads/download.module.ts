import { Module, type Provider } from '@nestjs/common'
import { DownloadTaskService } from '../../../hyper.implementation/download-task.service.js'
import { FileService } from '../../../hyper.implementation/file.service.js'
import { DriveActivity } from '../../../hyper.infrastructure/sdk/drive-activity.js'
import { HyperSdkModule } from '../../../hyper.infrastructure/sdk/hyper-sdk.module.js'
import { FileModule } from '../files/file.module.js'
import { DownloadTaskController } from './download.controller.js'

const downloadTaskProvider: Provider<DownloadTaskService> = {
  provide: DownloadTaskService,
  inject: [FileService, DriveActivity],
  useFactory: (files: FileService, activity: DriveActivity) => new DownloadTaskService(files, activity),
}

@Module({
  imports: [FileModule, HyperSdkModule],
  controllers: [DownloadTaskController],
  providers: [downloadTaskProvider],
  exports: [DownloadTaskService],
})
export class DownloadModule {}
