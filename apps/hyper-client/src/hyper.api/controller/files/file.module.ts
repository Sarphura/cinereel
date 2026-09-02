import { Module, type Provider } from '@nestjs/common'
import { SDK } from 'hyper-sdk'
import { FileService } from '../../../hyper.implementation/file.service.js'
import { HyperSdkModule } from '../../../hyper.infrastructure/sdk/hyper-sdk.module.js'
import { FileController } from './file.controller.js'

const fileServiceProvider: Provider<FileService> = {
  provide: FileService,
  inject: [SDK],
  useFactory: (sdk: SDK) => new FileService(sdk),
}

@Module({
  imports: [HyperSdkModule],
  controllers: [FileController],
  providers: [fileServiceProvider],
})
export class FileModule {}
