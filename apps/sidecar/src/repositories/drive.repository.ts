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
 */
import type { SDK, HyperdriveLike } from '../infrastructure/index.js'
import { isHex64 } from '../infrastructure/types/key.js'

export interface DriveRepository {
  /**
   * Open (or attach to) a drive by its UUID namespace. Used for locally
   * created drives; the SDK derives the same on-disk storage from the same
   * namespace string across restarts.
   */
  openLocal(uuid: string): Promise<HyperdriveLike>

  /**
   * Open a remote drive by its hex public key. Used for `swarm.mount`.
   * Throws on malformed driveKey — never let an unvalidated key reach
   * the SDK.
   */
  openRemote(driveKey: string): Promise<HyperdriveLike>

  /** Close any drive (local or remote). Errors are swallowed. */
  close(drive: HyperdriveLike): Promise<void>
}

/**
 * Production `DriveRepository` — thin wrapper around the official SDK's
 * `getDrive` + the underlying `Hyperdrive.close()`.
 */
export class HyperdriveRepository implements DriveRepository {
  constructor(private readonly sdk: SDK) {}

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