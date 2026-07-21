/**
 * Unit tests for `DriveService` — pure business rules, no SDK.
 *
 * Verifies:
 *   - `create()` assigns a UUID, registers the drive, writes the index.
 *   - `list()` reflects `registry.listLocal()` joined with `index.entries()`.
 *   - `remove()` refuses to delete the `main` drive.
 *   - `remove()` after bootstrap's `seed()` actually finds the UUID.
 */
import { describe, it, expect } from 'vitest'
import { DriveService, MAIN_NAMESPACE } from '../../src/services/drives.service.js'
import {
  InMemoryDriveIndexRepository,
  MAIN_INDEX_ENTRY,
} from '../../src/repositories/index.js'
import { InMemoryDriveRepository } from '../../src/repositories/index.js'
import { InMemoryDriveRegistry } from '../../src/bootstrap/drive-registry.js'
import { driveKeyOf } from '../../src/infrastructure/types/key.js'
import type { HyperdriveLike } from '../../src/infrastructure/index.js'

function setup() {
  const index = new InMemoryDriveIndexRepository()
  const drivesRepo = new InMemoryDriveRepository()
  const registry = new InMemoryDriveRegistry()
  const service = new DriveService(drivesRepo, index, registry)

  // Simulate bootstrap: main drive is mounted + seeded in the index.
  const mainKey = 'f'.repeat(64)
  const mainDrive: HyperdriveLike = {
    ...InMemoryDriveRepository.prototype as unknown as HyperdriveLike,
    key: Buffer.from(mainKey, 'hex'),
    core: { discoveryKey: new Uint8Array(32) },
  } as unknown as HyperdriveLike
  registry.rememberLocal(MAIN_NAMESPACE, mainDrive)
  void index.set(MAIN_NAMESPACE, MAIN_INDEX_ENTRY)

  const keyToUuid = new Map<string, string>([[mainKey, MAIN_NAMESPACE]])
  service.seed(keyToUuid)

  return { service, index, drivesRepo, registry, mainDrive }
}

describe('DriveService', () => {
  it('create() assigns a UUID and persists business metadata', async () => {
    const { service } = setup()
    const desc = await service.create('movies', 'blob')
    expect(desc.name).toBe('movies')
    expect(desc.type).toBe('blob')
    expect(desc.isLocal).toBe(true)
    expect(desc.driveKey).toMatch(/^[0-9a-f]{64}$/)
    expect(typeof desc.createdAt).toBe('string')
  })

  it('list() joins registry + index entries', async () => {
    const { service, registry } = setup()
    const desc = await service.create('movies', 'blob')
    const list = await service.list()
    const keys = list.map((d) => d.driveKey)
    expect(keys).toContain(desc.driveKey)
    // The main drive is always present
    expect(list.some((d) => d.name === 'main')).toBe(true)
    expect(registry.listLocal().length).toBe(list.length)
  })

  it('remove() refuses to delete the main drive', async () => {
    const { service, registry } = setup()
    const mainKey = driveKeyOf(registry.byNamespace(MAIN_NAMESPACE)!)
    await expect(service.remove(mainKey)).rejects.toThrow(/main/)
  })

  it('remove() with unknown driveKey is a no-op', async () => {
    const { service } = setup()
    await expect(service.remove('a'.repeat(64))).resolves.toBeUndefined()
  })

  it('remove() deletes a non-main drive after seed()', async () => {
    const { service, index, registry } = setup()
    const desc = await service.create('movies', 'blob')
    await service.remove(desc.driveKey)
    expect(index.entries()[desc.driveKey]).toBeUndefined()
    expect(registry.listLocal().some((d) => d.driveKey === desc.driveKey)).toBe(false)
  })
})