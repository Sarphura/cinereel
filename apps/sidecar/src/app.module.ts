/**
 * AppModule — root Nest module.
 *
 * Composition: Core* modules (config, logger, sdk) + BootstrapModule
 * (services + composition) + Feature* modules (HTTP controllers).
 *
 * Modules are loaded once during NestFactory.create(); the order in
 * `imports` is the dependency order.
 */
import { Module } from '@nestjs/common'
import { CoreConfigModule } from './core/config/config.module.js'
import { CoreLoggerModule } from './core/logging/logger.module.js'
import { CoreSdkModule } from './core/sdk/sdk.module.js'
import { BootstrapModule } from './bootstrap/bootstrap.module.js'
import { HealthModule } from './feature/health/module.js'
import { AuthModule } from './feature/auth/module.js'
import { DrivesModule } from './feature/drives/module.js'
import { SwarmModule } from './feature/swarm/module.js'

@Module({
  imports: [
    CoreConfigModule,
    CoreLoggerModule,
    CoreSdkModule.forRootAsync(),
    BootstrapModule,
    HealthModule,
    AuthModule,
    DrivesModule,
    SwarmModule,
  ],
})
export class AppModule {}
