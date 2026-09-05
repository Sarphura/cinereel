import {
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common'
import { create, SDK } from 'hyper-sdk'
import { resolve } from 'node:path'
import { DriveActivity } from './drive-activity.js'

const DEFAULT_CONFIG_DIR = '.cinereel'

export function GetConfigPath(): string {
  const configDir = process.env.CONFIG_DIR || DEFAULT_CONFIG_DIR
  return resolve(process.cwd(), configDir)
}

const hyperSdkProvider: Provider<SDK> = {
  provide: SDK,
  useFactory: (): Promise<SDK> => create({ storage: GetConfigPath() }),
}

class HyperSdkLifecycle implements OnApplicationShutdown {
  constructor(private readonly sdk: SDK) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sdk.close()
  }
}

const hyperSdkLifecycleProvider: Provider<HyperSdkLifecycle> = {
  provide: HyperSdkLifecycle,
  inject: [SDK],
  useFactory: (sdk: SDK) => new HyperSdkLifecycle(sdk),
}

@Module({
  providers: [hyperSdkProvider, hyperSdkLifecycleProvider, DriveActivity],
  exports: [SDK, DriveActivity],
})
export class HyperSdkModule {}
