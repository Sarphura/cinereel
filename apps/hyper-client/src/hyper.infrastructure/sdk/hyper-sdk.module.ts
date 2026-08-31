import {
  Module,
  type OnModuleDestroy,
  type Provider,
} from '@nestjs/common'
import { create, SDK } from 'hyper-sdk'
import { resolve } from 'node:path'

const DEFAULT_CONFIG_DIR = '.cinereel'

export function GetConfigPath(): string {
  const configDir = process.env.CONFIG_DIR || DEFAULT_CONFIG_DIR
  return resolve(process.cwd(), configDir)
}

const hyperSdkProvider: Provider<SDK> = {
  provide: SDK,
  useFactory: (): Promise<SDK> => create({ storage: GetConfigPath() }),
}

class HyperSdkLifecycle implements OnModuleDestroy {
  constructor(private readonly sdk: SDK) {}

  async onModuleDestroy(): Promise<void> {
    await this.sdk.close()
  }
}

const hyperSdkLifecycleProvider: Provider<HyperSdkLifecycle> = {
  provide: HyperSdkLifecycle,
  inject: [SDK],
  useFactory: (sdk: SDK) => new HyperSdkLifecycle(sdk),
}

@Module({
  providers: [hyperSdkProvider, hyperSdkLifecycleProvider],
  exports: [SDK],
})
export class HyperSdkModule {}
