import { Module, type Provider } from '@nestjs/common'
import { SDK } from 'hyper-sdk'
import { FileService } from '../../service/file.service.js'
import { HyperSdkModule } from '../../repository/sdk/hyper-sdk.module.js'
import { FileController } from './file.controller.js'
import { ProtocolFileController } from './protocol-file.controller.js'
import { DriveActivity } from '../../repository/sdk/drive-activity.js'
import { FastifyFileResponseWriter, FileResponseWriter } from './file-response.writer.js'

const fileServiceProvider: Provider<FileService> = {
  provide: FileService,
  inject: [SDK, DriveActivity],
  useFactory: (sdk: SDK, activity: DriveActivity) => new FileService(sdk, activity),
}

@Module({
  imports: [HyperSdkModule],
  controllers: [FileController, ProtocolFileController],
  providers: [
    fileServiceProvider,
    { provide: FileResponseWriter, useClass: FastifyFileResponseWriter },
  ],
  exports: [FileService],
})
export class FileModule {}
