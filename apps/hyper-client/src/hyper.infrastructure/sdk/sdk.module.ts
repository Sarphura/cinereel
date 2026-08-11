/**
 * CoreSdkModule — the new `infrastructure/sdk/index.ts` boundary.
 *
 * Wraps the official `hyper-sdk` `create()` call as a NestJS provider.
 * The SDK is the ONLY place `import 'hyper-sdk'` is permitted (still
 * enforced by the ESLint `no-restricted-imports` rule).
 *
 * The `SdkLifecycle` provider hooks `OnModuleDestroy` to call
 * `sdk.close()` on graceful shutdown, replacing the manual sequence in
 * `src/index.ts`.
 */
import { Injectable } from '@nestjs/common'
import { Global, Inject, Logger, Module, OnModuleDestroy, type DynamicModule } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { create } from './hyper-sdk-export.js'
import type { SDK } from '../types/index.js'

export const SDK_TOKEN = Symbol('SDK')

@Injectable()
class SdkLifecycle implements OnModuleDestroy {
  private readonly logger = new Logger(SdkLifecycle.name)
  constructor(@Inject(SDK_TOKEN) private readonly sdk: SDK) {}
  async onModuleDestroy(): Promise<void> {
    try {
      await this.sdk.close()
    } catch (err) {
      this.logger.warn(`sdk.close() error: ${(err as Error).message}`)
    }
  }
}

// Nest needs @Injectable to register the class as a provider; importing
// Injectable inline avoids adding another import line.

@Global()
@Module({})
export class CoreSdkModule {
  static forRootAsync(): DynamicModule {
    return {
      module: CoreSdkModule,
      providers: [
        {
          provide: SDK_TOKEN,
          useFactory: async (cfg: ConfigService): Promise<SDK> => {
            const port = (cfg.get<number>('swarmPort') ?? 0) as number
            const bootstrap = cfg.get<string[] | undefined>('bootstrap') as string[] | undefined
            const storeDir = cfg.get<string>('storeDir') as string
            return await create({
              storage: storeDir,
              autoJoin: true,
              swarmOpts: {
                ...(port > 0 ? { port } : {}),
                ...(bootstrap && bootstrap.length > 0 ? { bootstrap } : {}),
              },
            })
          },
          inject: [ConfigService],
        },
        SdkLifecycle,
      ],
      exports: [SDK_TOKEN],
      global: true,
    }
  }
}
