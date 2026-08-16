/**
 * DrivesModule — registers the DrivesController and DriveService.
 */
import { Module } from '@nestjs/common'
import { DriveService } from '@hyper.implementation/drives.service.js'
import { DrivesController } from './drives.controller.js'
import { DRIVE_SERVICE } from './drives.tokens.js'

@Module({
  controllers: [DrivesController],
  providers: [
    {
      provide: DRIVE_SERVICE,
      useClass: DriveService,
    },
  ],
  exports: [DRIVE_SERVICE],
})
export class DrivesModule {}{}
