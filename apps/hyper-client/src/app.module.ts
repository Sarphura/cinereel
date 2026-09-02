import { Module, type DynamicModule } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import {
  ZodSerializerInterceptor,
  ZodValidationPipe,
} from 'nestjs-zod'
import { HealthModule } from './hyper.api/controller/health/health.module.js'
import { VersionModule } from './hyper.api/controller/version/version.module.js'
import { DrivesModule } from './hyper.api/controller/drives/drives.module.js'
import { FileModule } from './hyper.api/controller/files/file.module.js'
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
        // SwarmModule,
      ],
      providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    }
  }
}
