/**
 * DriveService — drive-lifecycle business rules (CSR layer: services).
 *
 * Wraps the `DriveRepository` (Hyperdrive open/close) and
 * `DriveIndexRepository` (persisted business metadata) behind a small
 * use-case interface. Owns the `keyToUuid` reverse map that lets `remove()`
 * look up a UUID by driveKey — bootstrap seeds it from the recovered
 * registry so first-remove after restart works.
 *
 * NestJS: marked @Injectable so it can be consumed via constructor
 * injection from any feature controller. We annotate every constructor
 * parameter with `@Inject(<token>)` because the parameter types are
 * interfaces (which TypeScript's emit-decorator-metadata cannot resolve
 * to a runtime value), and we want the resolution to work without
 * relying on `import` rewriting.
 */
import { Inject, Injectable } from '@nestjs/common'
import type {
  DriveDescriptor,
  DriveType,
  HyperdriveLike,
} from '../infrastructure/index.js'
import {
  MAIN_INDEX_ENTRY,
  HyperdriveRepository,
  FileSystemDriveIndexRepository,
  InMemoryDriveIndexRepository,
  InMemoryDriveRepository,
  type DriveRepository,
  type DriveIndexRepository,
} from '../repositories/index.js'
import { InMemoryDriveRegistry, type DriveRegistry } from '../bootstrap/drive-registry.js'
import { driveKeyOf } from '../infrastructure/types/key.js'

/** The "main" drive namespace — fixed across restarts. */
export const MAIN_NAMESPACE = 'main'

@Injectable()
export class DriveService {
  private keyToUuid: Map<string, string> = new Map()

  constructor(
    @Inject(HyperdriveRepository) private readonly drives: DriveRepository,
    @Inject(FileSystemDriveIndexRepository) private readonly index: DriveIndexRepository,
    @Inject(InMemoryDriveRegistry) private readonly registry: DriveRegistry,
  ) {}

  // Touch the imports so tree-shaking doesn't drop them — they're used as
  // tokens above via `@Inject(...)`. The class identities themselves matter,
  // not values.
  private static readonly _tok = [InMemoryDriveIndexRepository, InMemoryDriveRepository] as const

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