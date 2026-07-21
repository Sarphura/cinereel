/**
 * DriveService — drive-lifecycle business rules (CSR layer: services).
 *
 * Wraps the `DriveRepository` (Hyperdrive open/close) and
 * `DriveIndexRepository` (persisted business metadata) behind a small
 * use-case interface. Owns the `keyToUuid` reverse map that lets `remove()`
 * look up a UUID by driveKey — bootstrap seeds it from the recovered
 * registry so first-remove after restart works.
 *
 * Mount bookkeeping (which drives are open) lives in `DriveRegistry`, not
 * here; this service only persists the business metadata.
 */
import type {
  DriveDescriptor,
  DriveType,
  HyperdriveLike,
} from '../infrastructure/index.js'
import { MAIN_INDEX_ENTRY } from '../repositories/drive-index.repository.js'
import type { DriveRepository } from '../repositories/drive.repository.js'
import type { DriveIndexRepository } from '../repositories/drive-index.repository.js'
import type { DriveRegistry } from '../bootstrap/drive-registry.js'
import { driveKeyOf } from '../infrastructure/types/key.js'

/** The "main" drive namespace — fixed across restarts. */
export const MAIN_NAMESPACE = 'main'

export class DriveService {
  private keyToUuid: Map<string, string> = new Map()

  constructor(
    private readonly drives: DriveRepository,
    private readonly index: DriveIndexRepository,
    private readonly registry: DriveRegistry,
  ) {}

  /**
   * Bootstrap helper: inject the `keyToUuid` reverse map derived from
   * the recovered `DriveRegistry`. After `seed()`, `remove(driveKey)`
   * can locate the UUID for every persisted drive.
   */
  seed(keyToUuid: Map<string, string>): void {
    this.keyToUuid = new Map(keyToUuid)
  }

  async create(name: string, type: DriveType): Promise<DriveDescriptor> {
    const uuid = crypto.randomUUID()
    const drive = await this.drives.openLocal(uuid)
    this.registry.rememberLocal(uuid, drive)
    const driveKey = driveKeyOf(drive)
    this.keyToUuid.set(driveKey, uuid)
    await this.index.set(uuid, {
      name,
      type,
      createdAt: new Date().toISOString(),
    })
    return {
      driveKey,
      name,
      type,
      isLocal: true,
      createdAt: new Date().toISOString(),
    }
  }

  async list(): Promise<DriveDescriptor[]> {
    const entries = this.index.entries()
    const out: DriveDescriptor[] = []
    for (const { uuid, driveKey } of this.registry.listLocal()) {
      const entry = entries[uuid]
      out.push({
        driveKey,
        name: entry?.name ?? uuid,
        type: entry?.type ?? 'blob',
        isLocal: true,
        createdAt: entry?.createdAt,
      })
    }
    return out
  }

  async remove(driveKey: string): Promise<void> {
    const uuid = this.keyToUuid.get(driveKey)
    if (!uuid) return
    if (uuid === MAIN_NAMESPACE) {
      throw new Error('Cannot remove the main drive')
    }
    await this.index.remove(uuid)
    this.keyToUuid.delete(driveKey)
    this.registry.forgetLocal(uuid)
  }

  /** Bootstrap helper: ensure the persistent index always has the main entry. */
  async ensureMainIndexed(): Promise<HyperdriveLike> {
    const main = this.registry.byNamespace(MAIN_NAMESPACE)
    if (!main) throw new Error('main drive not mounted')
    const existing = this.index.entries()[MAIN_NAMESPACE]
    if (!existing) {
      await this.index.set(MAIN_NAMESPACE, MAIN_INDEX_ENTRY)
    }
    return main
  }
}