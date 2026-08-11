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
import { CoreConfigModule } from './hyper.infrastructure/config/config.module.js'
import { CoreLoggerModule } from './hyper.infrastructure/logging/logger.module.js'
import { CoreSdkModule } from './hyper.infrastructure/sdk/sdk.module.js'
import { SecurityModule } from './hyper.infrastructure/security/security.module.js'
import { AuthMiddlewareModule } from './hyper.api/middleware/auth-middleware.module.js'
import { BootstrapModule } from './hyper.domain/bootstrap/bootstrap.module.js'
import { HealthModule } from './hyper.api/controller/health.module.js'
import { VersionModule } from './hyper.api/controller/version.module.js'
import { DrivesModule } from './hyper.api/controller/drives.module.js'
import { FilesModule } from './hyper.api/controller/files.module.js'
import { SwarmModule } from './hyper.api/controller/swarm.module.js'
import type { SharedTokenPort } from './hyper.infrastructure/security/security.tokens.js'

@Module({})
export class AppModule {
  /**
   * Build the AppModule with the shared-secret token pre-loaded.
   * The token comes from `<CINEREEL_DATA_DIR>/sidecar.token` and is
   * minted by `loadOrMintSharedToken()` in `main.ts` *before* Nest
   * constructs the graph. Tests call `forRoot(testToken)` with a
   * deterministic value.
   */
  static forRoot(sharedToken: SharedTokenPort): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreConfigModule,
        CoreLoggerModule,
        CoreSdkModule.forRootAsync(),
        SecurityModule.forRoot(sharedToken),
        AuthMiddlewareModule,
        BootstrapModule,
        HealthModule,
        VersionModule,
        DrivesModule,
        FilesModule,
        SwarmModule,
      ],
    }
  }
}
