/**
 * In-memory `DriveIndexRepository` for tests.
 *
 * Behaves identically to `FileSystemDriveIndexRepository` minus the
 * disk persistence — every `set` / `remove` mutates the mirror only.
 */
import { MAIN_INDEX_ENTRY, type DriveIndexEntry, type DriveIndexRepository } from '../drive-index.repository.js'

export class InMemoryDriveIndexRepository implements DriveIndexRepository {
  private store: Record<string, DriveIndexEntry> = { main: MAIN_INDEX_ENTRY }

  async load(): Promise<Record<string, DriveIndexEntry>> {
    return this.store
  }

  entries(): Record<string, DriveIndexEntry> {
    return this.store
  }

  async set(uuid: string, entry: DriveIndexEntry): Promise<void> {
    this.store[uuid] = entry
  }

  async remove(uuid: string): Promise<void> {
    if (uuid === 'main') throw new Error('Cannot remove the main drive')
    delete this.store[uuid]
  }
}