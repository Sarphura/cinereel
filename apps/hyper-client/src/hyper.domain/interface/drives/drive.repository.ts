/**
 * DriveRepository — data access layer for Hyperdrive instances.
 *
 * Hides the official `hyper-sdk`'s `SDK.getDrive()` and `drive.close()`
 * behind a CSR repository interface so services can be unit-tested without
 * a real SDK and so the persistence technology (today: in-process
 * Hyperdrive; tomorrow: maybe a remote metadata service) can change
 * without rippling into `services/`.
 *
 * Concrete implementation: `HyperdriveRepository` (wraps `hyper-sdk`).
 * Fake implementation for tests: `repositories/in-memory/`.
 *
 * NestJS: `HyperdriveRepository` is `@Injectable` so it can be a
 * constructor-injected provider; the `SDK` constructor parameter is an
 * interface so we annotate it explicitly with `@Inject(SDK_TOKEN)`.
 */
import { Inject, Injectable } from '@nestjs/common'
import { SDK_TOKEN } from '../../../hyper.infrastructure/sdk/sdk.module.js'
import type { SDK, HyperdriveLike } from '../../../hyper.infrastructure/types/index.js'
import { isHex64 } from '../../../hyper.infrastructure/types/key.js'

export interface DriveRepository {
  openLocal(uuid: string): Promise<HyperdriveLike>
  openRemote(driveKey: string): Promise<HyperdriveLike>
  close(drive: HyperdriveLike): Promise<void>
}

@Injectable()
export class HyperdriveRepository implements DriveRepository {
  constructor(@Inject(SDK_TOKEN) private readonly sdk: SDK) {}

  async openLocal(uuid: string): Promise<HyperdriveLike> {
    return (await this.sdk.getDrive(uuid)) as unknown as HyperdriveLike
  }

  async openRemote(driveKey: string): Promise<HyperdriveLike> {
    if (!isHex64(driveKey)) {
      throw new Error(`invalid publicKey: ${driveKey.slice(0, 80)}`)
    }
    return (await this.sdk.getDrive(driveKey)) as unknown as HyperdriveLike
  }

  async close(drive: HyperdriveLike): Promise<void> {
    await drive.close().catch(() => undefined)
  }
}