import { Module, type Provider } from '@nestjs/common'
import { DownloadTaskService } from '../../service/download-task.service.js'
import { FileService } from '../../service/file.service.js'
import { DriveActivity } from '../../repository/sdk/drive-activity.js'
import { HyperSdkModule } from '../../repository/sdk/hyper-sdk.module.js'
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
