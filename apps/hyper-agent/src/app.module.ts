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
import { CoreConfigModule } from './core/config/config.module.js'
import { CoreLoggerModule } from './core/logging/logger.module.js'
import { CoreSdkModule } from './core/sdk/sdk.module.js'
import { SecurityModule } from './core/security/security.module.js'
import { AuthMiddlewareModule } from './core/middleware/auth-middleware.module.js'
import { BootstrapModule } from './bootstrap/bootstrap.module.js'
import { HealthModule } from './feature/health/module.js'
import { DrivesModule } from './feature/drives/module.js'
import { SwarmModule } from './feature/swarm/module.js'
import type { SharedTokenPort } from './infrastructure/security/security.tokens.js'

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
        DrivesModule,
        SwarmModule,
      ],
    }
  }
}
