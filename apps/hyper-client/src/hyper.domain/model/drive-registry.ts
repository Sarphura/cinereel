/**
 * DriveRegistry — the sidecar's bookkeeping for "which Hyperdrive is mounted
 * under which name?"
 *
 * Lives in `bootstrap/` (CSR layer: composition), not in `repositories/`:
 * it is in-process application state (Maps), not a data-access abstraction.
 * `DriveRegistry` is shared across services — `DriveService` reads/writes
 * local mounts, `FileService` consults `isRemote` / `byKey`, `SwarmService`
 * registers remote mounts.
 *
 * Invariants:
 *   - Every local drive is tracked under BOTH its UUID namespace AND its
 *     hex `driveKey` (the two are 1:1).
 *   - Remote mounts are tracked ONLY under their `driveKey` (we don't
 *     know — and don't need — a UUID for them).
 *   - `byKey()` finds both local and remote; `byNamespace()` finds local
 *     only; `isRemote()` discriminates.
 */
import type { HyperdriveLike } from '../../hyper.infrastructure/types/hyperdrive.js'
import { driveKeyOf } from '../../hyper.infrastructure/types/key.js'

export interface DriveRegistry {
  /** Resolve a hex driveKey to its mounted `HyperdriveLike`, if any. */
  byKey(driveKey: string): HyperdriveLike | null
  /** Resolve a UUID namespace to its mounted `HyperdriveLike`, if any. */
  byNamespace(uuid: string): HyperdriveLike | null
  /** True if `driveKey` was opened via `sdk.getDrive(hex)` (i.e. remote-by-key). */
  isRemote(driveKey: string): boolean
  /** All locally-mounted drives (UUID namespace order). */
  listLocal(): Array<{ uuid: string; driveKey: string }>
  /** Close a remote mount by driveKey and forget it. No-op if not remote. */
  closeRemote(driveKey: string): Promise<void>
  /** Remember a newly-created local drive (UUID → Hyperdrive). */
  rememberLocal(uuid: string, drive: HyperdriveLike): void
  /** Remember a newly-mounted remote drive (driveKey → Hyperdrive). */
  rememberRemote(driveKey: string, drive: HyperdriveLike): void
  /** Forget a local mount (used on remove). */
  forgetLocal(uuid: string): void
}

/** Concrete `DriveRegistry` — in-memory maps. */
export class InMemoryDriveRegistry implements DriveRegistry {
  private readonly localByUuid = new Map<string, HyperdriveLike>()
  private readonly localByKey = new Map<string, HyperdriveLike>()
  private readonly remoteByKey = new Map<string, HyperdriveLike>()

  byKey(driveKey: string): HyperdriveLike | null {
    return this.localByKey.get(driveKey) ?? this.remoteByKey.get(driveKey) ?? null
  }

  byNamespace(uuid: string): HyperdriveLike | null {
    return this.localByUuid.get(uuid) ?? null
  }

  isRemote(driveKey: string): boolean {
    return this.remoteByKey.has(driveKey)
  }

  listLocal(): Array<{ uuid: string; driveKey: string }> {
    const out: Array<{ uuid: string; driveKey: string }> = []
    for (const [uuid, drive] of this.localByUuid) {
      out.push({ uuid, driveKey: driveKeyOf(drive) })
    }
    return out
  }

  async closeRemote(driveKey: string): Promise<void> {
    const drive = this.remoteByKey.get(driveKey)
    if (!drive) return
    this.remoteByKey.delete(driveKey)
    await drive.close().catch(() => undefined)
  }

  rememberLocal(uuid: string, drive: HyperdriveLike): void {
    this.localByUuid.set(uuid, drive)
    this.localByKey.set(driveKeyOf(drive), drive)
  }

  rememberRemote(driveKey: string, drive: HyperdriveLike): void {
    this.remoteByKey.set(driveKey, drive)
  }

  forgetLocal(uuid: string): void {
    const drive = this.localByUuid.get(uuid)
    if (!drive) return
    this.localByUuid.delete(uuid)
    this.localByKey.delete(driveKeyOf(drive))
    void drive.close().catch(() => undefined)
  }
}