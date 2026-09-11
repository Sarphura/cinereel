import { Module, ValidationPipe, type DynamicModule } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { HealthModule } from './controller/health/health.module.js'
import { VersionModule } from './controller/version/version.module.js'
import { DrivesModule } from './controller/drives/drives.module.js'
import { FileModule } from './controller/files/file.module.js'
import { DownloadModule } from './controller/downloads/download.module.js'
import { DriveFileExceptionFilter } from './controller/files/drivefile-exception.filter.js'
// import { SwarmModule } from './hyper.api/controller/swarms/swarm.module.js'

@Module({})
export class AppModule {
  /** 构建应用的 composition root。 */
  static forRoot(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        HealthModule,
        VersionModule,
        DrivesModule,
        FileModule,
        DownloadModule,
        // SwarmModule,
      ],
      providers: [
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
        },
        { provide: APP_FILTER, useClass: DriveFileExceptionFilter },
      ],
    }
  }
}
