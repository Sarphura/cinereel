import {
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type Provider,
} from '@nestjs/common'
import { create, type SDK } from 'hyper-sdk'
import { resolve } from 'node:path'

const DEFAULT_STORAGE_DIR = '.hyper-storage'

export const HYPER_SDK = Symbol('HYPER_SDK')

export function resolveHyperStoragePath(): string {
  const storageDir = process.env.HYPER_STORAGE_DIR || DEFAULT_STORAGE_DIR
  return resolve(process.cwd(), storageDir)
}

const hyperSdkProvider: Provider = {
  provide: HYPER_SDK,
  useFactory: (): Promise<SDK> => create({ storage: resolveHyperStoragePath() }),
}

@Injectable()
class HyperSdkLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(HYPER_SDK)
    private readonly sdk: SDK,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.sdk.close()
  }
}

@Module({
  providers: [hyperSdkProvider, HyperSdkLifecycle],
  exports: [HYPER_SDK],
})
export class HyperSdkModule {}
