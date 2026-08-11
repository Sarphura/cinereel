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
 *
 * Persistence is **atomic** (ticket 07): every write goes through
 * `persistAtomic()`, which writes to a sibling temp file and then renames
 * over the target. A crash mid-write leaves either the previous valid
 * file or the new valid file on disk; never a half-formed file. A
 * startup that finds a half-formed file fails loudly with exit 79
 * (EXIT_DRIVE_INDEX_CORRUPT) instead of silently dropping drives.
 */
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import type { DriveType } from '../../../hyper.infrastructure/types/index.js'

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
const INDEX_VERSION = 1 as const

function indexPath(storeDir: string): string {
  return path.join(storeDir, INDEX_FILENAME)
}

/** Strict minimum-shape check used by `load()` to reject half-formed files. */
function assertDriveIndexShape(parsed: unknown): asserts parsed is {
  version: number
  entries: Record<string, DriveIndexEntry>
} {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('drive-index.json is not a JSON object')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.version !== INDEX_VERSION) {
    throw new Error(`Unknown drive-index version: ${String(obj.version)}`)
  }
  const entries = obj.entries
  if (!entries || typeof entries !== 'object') {
    throw new Error('drive-index.json is missing the `entries` object')
  }
  for (const [uuid, value] of Object.entries(entries)) {
    if (!value || typeof value !== 'object') {
      throw new Error(
        `drive-index.json entry for uuid=${uuid} is not an object`,
      )
    }
    const e = value as Record<string, unknown>
    if (typeof e.name !== 'string' || typeof e.createdAt !== 'string') {
      throw new Error(
        `drive-index.json entry for uuid=${uuid} is missing name/createdAt`,
      )
    }
    if (e.type !== 'metadata' && e.type !== 'blob') {
      throw new Error(
        `drive-index.json entry for uuid=${uuid} has invalid type=${String(e.type)}`,
      )
    }
  }
}

/**
 * Default `DriveIndexRepository` — JSON-on-disk with atomic writes.
 *
 * Holds an in-memory `_entries` mirror after `load()` so that the sidecar
 * can avoid a re-read on every `entries()` call. `set` / `remove` mutate
 * the mirror and then call `persistAtomic()` (write-temp + rename).
 */
export class FileSystemDriveIndexRepository implements DriveIndexRepository {
  private _entries: Record<string, DriveIndexEntry> = { main: MAIN_INDEX_ENTRY }

  constructor(private readonly storeDir: string) {}

  async load(): Promise<Record<string, DriveIndexEntry>> {
    let raw: string
    try {
      raw = await readFile(indexPath(this.storeDir), 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // First run: no index yet — start with main only
        this._entries = { main: MAIN_INDEX_ENTRY }
        return this._entries
      }
      throw err
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      throw new Error(
        `drive-index.json is not valid JSON: ${(err as Error).message}`,
      )
    }
    assertDriveIndexShape(parsed)
    this._entries = { main: MAIN_INDEX_ENTRY, ...parsed.entries }
    return this._entries
  }

  entries(): Record<string, DriveIndexEntry> {
    return this._entries
  }

  async set(uuid: string, entry: DriveIndexEntry): Promise<void> {
    this._entries[uuid] = entry
    await this.persistAtomic()
  }

  async remove(uuid: string): Promise<void> {
    if (uuid === 'main') throw new Error('Cannot remove the main drive')
    delete this._entries[uuid]
    await this.persistAtomic()
  }

  /**
   * Atomic write: write to `<file>.tmp.<rand>` then rename over the target.
   *
   * The temp file lives in the SAME directory as the target so the rename
   * is atomic on POSIX (same filesystem). On Windows, rename-over-existing
   * requires the destination not to be open; Node's `rename` implements
   * the platform-correct sequence.
   *
   * If a previous half-formed temp file exists (from a crash), it is
   * ignored — we always write to a fresh randomized suffix.
   */
  private async persistAtomic(): Promise<void> {
    const target = indexPath(this.storeDir)
    await mkdir(this.storeDir, { recursive: true })
    const tmp = `${target}.tmp.${randomBytes(6).toString('hex')}`
    const content = {
      version: INDEX_VERSION,
      entries: { ...this._entries },
    }
    await writeFile(tmp, JSON.stringify(content, null, 2), 'utf-8')
    await rename(tmp, target)
  }
}
