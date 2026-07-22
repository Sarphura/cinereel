import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { validateOrThrow, type Config } from './env.schema.js'

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateOrThrow,
    }),
  ],
  exports: [ConfigModule],
})
export class CoreConfigModule {}

// re-export for convenience
export type { Config }
