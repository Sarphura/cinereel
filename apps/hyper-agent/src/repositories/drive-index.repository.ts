/**
 * DriveIndexRepository — persisted business-layer metadata for drives.
 *
 * The repository is the CSR data-access layer: it owns the JSON file on
 * disk (`{storeDir}/drive-index.json`) and exposes a small interface
 * (`load` / `set` / `remove` / `entries`). Services depend on the
 * interface, not on the filesystem — see `FileSystemDriveIndexRepository`
 * for the default implementation and
 * `repositories/in-memory/fake-drive-index.repository.ts` for tests.
 *
 * Schema (on disk):
 * ```json
 * {
 *   "version": 1,
 *   "entries": {
 *     "<uuid>": {
 *       "name": "movies",
 *       "type": "blob",
 *       "createdAt": "2026-07-18T12:00:00.000Z"
 *     }
 *   }
 * }
 * ```
 *
 * The `uuid` key matches the Corestore namespace name, which is stable
 * across restarts because Corestore derives the same storage from the same
 * namespace string.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { DriveType } from '../infrastructure/index.js'

export interface DriveIndexEntry {
  name: string
  type: DriveType
  createdAt: string
}

export interface DriveIndexRepository {
  /** All index entries keyed by UUID (= Corestore namespace name). */
  entries(): Record<string, DriveIndexEntry>

  /** Read the index from disk (returns empty if file does not exist). */
  load(): Promise<Record<string, DriveIndexEntry>>

  /** Persist an entry. */
  set(uuid: string, entry: DriveIndexEntry): Promise<void>

  /** Remove an entry. */
  remove(uuid: string): Promise<void>
}

/** The index entry for the special 'main' drive. */
export const MAIN_INDEX_ENTRY: DriveIndexEntry = {
  name: 'main',
  type: 'metadata',
  createdAt: '2024-01-01T00:00:00.000Z',
}

const INDEX_FILENAME = 'drive-index.json'

function indexPath(storeDir: string): string {
  return path.join(storeDir, INDEX_FILENAME)
}

/**
 * Default `DriveIndexRepository` — JSON-on-disk.
 *
 * Holds an in-memory `_entries` mirror after `load()` so that the sidecar
 * can avoid a re-read on every `entries()` call. `set` / `remove` mutate
 * the mirror and then persist.
 */
export class FileSystemDriveIndexRepository implements DriveIndexRepository {
  private _entries: Record<string, DriveIndexEntry> = { main: MAIN_INDEX_ENTRY }

  constructor(private readonly storeDir: string) {}

  async load(): Promise<Record<string, DriveIndexEntry>> {
    try {
      const raw = await readFile(indexPath(this.storeDir), 'utf-8')
      const parsed = JSON.parse(raw) as {
        version: number
        entries: Record<string, DriveIndexEntry>
      }
      if (parsed.version !== 1) {
        throw new Error(`Unknown drive-index version: ${parsed.version}`)
      }
      this._entries = { main: MAIN_INDEX_ENTRY, ...parsed.entries }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // First run: no index yet — start with main only
        this._entries = { main: MAIN_INDEX_ENTRY }
      } else {
        throw err
      }
    }
    return this._entries
  }

  entries(): Record<string, DriveIndexEntry> {
    return this._entries
  }

  async set(uuid: string, entry: DriveIndexEntry): Promise<void> {
    this._entries[uuid] = entry
    await this.persist()
  }

  async remove(uuid: string): Promise<void> {
    if (uuid === 'main') throw new Error('Cannot remove the main drive')
    delete this._entries[uuid]
    await this.persist()
  }

  private async persist(): Promise<void> {
    const content = {
      version: 1 as const,
      entries: { ...this._entries },
    }
    await mkdir(this.storeDir, { recursive: true })
    await writeFile(
      indexPath(this.storeDir),
      JSON.stringify(content, null, 2),
      'utf-8',
    )
  }
}