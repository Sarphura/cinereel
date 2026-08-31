import { Module } from '@nestjs/common'
import { FileService } from '@hyper.implementation/file.service.js'
import { HyperSdkModule } from '@hyper.infrastructure/sdk/hyper-sdk.module.js'
import { FileController } from './file.controller.js'

@Module({
  imports: [HyperSdkModule],
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
