/**
 * AppModule — root Nest module.
 *
 * Composition: Core* modules (config, logger, sdk, security) +
 * BootstrapModule (services + composition) + Feature* modules
 * (HTTP controllers).
 *
 * The `SecurityModule` must be imported before `AuthMiddlewareModule`
 * because the middleware's constructor `@Inject(SHARED_TOKEN)` will
 * fail otherwise.
 *
 * Modules are loaded once during NestFactory.create(); the order in
 * `imports` is the dependency order.
 */
import { Module, type DynamicModule } from '@nestjs/common'
import { HealthModule } from './hyper.api/controller/health/health.module.js'
import { VersionModule } from './hyper.api/controller/version/version.module.js'
import { DrivesModule } from './hyper.api/controller/drives/drives.module.js'
import { FilesModule } from './hyper.api/controller/files/files.module.js'
import { SwarmModule } from './hyper.api/controller/swarms/swarm.module.js'

@Module({})
export class AppModule {
  /**
   * Build the AppModule with the shared-secret token pre-loaded.
   * The token comes from `<CINEREEL_DATA_DIR>/sidecar.token` and is
   * minted by `loadOrMintSharedToken()` in `main.ts` *before* Nest
   * constructs the graph. Tests call `forRoot(testToken)` with a
   * deterministic value.
   */
  static forRoot(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        HealthModule,
        VersionModule,
        DrivesModule,
        FilesModule,
        SwarmModule,
      ],
    }
  }
}
