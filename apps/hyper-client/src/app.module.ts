import { Module, type DynamicModule } from '@nestjs/common'
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
    }
  }
}
