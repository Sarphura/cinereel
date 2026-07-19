/**
 * DriveIndex — persisted business-layer metadata for Hyperdrive instances.
 *
 * Stored alongside the Corestore data in `{storeDir}/drive-index.json`.
 *
 * Schema:
 * ```json
 * {
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
 * The `uuid` key matches the Corestore namespace name, which is stable across
 * restarts because Corestore derives the same storage from the same namespace string.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { DriveType } from '@cinereel/hyper-sdk';

export interface DriveIndexEntry {
  name: string;
  type: DriveType;
  createdAt: string;
}

interface DriveIndexFile {
  version: 1;
  entries: Record<string, DriveIndexEntry>;
}

/** The index entry for the special 'main' drive. */
export const MAIN_INDEX_ENTRY: DriveIndexEntry = {
  name: 'main',
  type: 'metadata',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const INDEX_FILENAME = 'drive-index.json';

function indexPath(storeDir: string): string {
  return path.join(storeDir, INDEX_FILENAME);
}

export interface DriveIndex {
  /**
   * All index entries keyed by UUID (= Corestore namespace name).
   * Includes the 'main' entry.
   */
  entries(): Record<string, DriveIndexEntry>;

  /** Read the index from disk (returns empty if file does not exist). */
  load(): Promise<Record<string, DriveIndexEntry>>;

  /** Persist an entry. */
  set(uuid: string, entry: DriveIndexEntry): Promise<void>;

  /** Remove an entry. */
  remove(uuid: string): Promise<void>;
}

export function createDriveIndex(storeDir: string): DriveIndex {
  let _entries: Record<string, DriveIndexEntry> = {
    main: MAIN_INDEX_ENTRY,
  };

  async function load(): Promise<Record<string, DriveIndexEntry>> {
    try {
      const raw = await readFile(indexPath(storeDir), 'utf-8');
      const parsed = JSON.parse(raw) as DriveIndexFile;
      if (parsed.version !== 1) throw new Error(`Unknown drive-index version: ${parsed.version}`);
      _entries = { main: MAIN_INDEX_ENTRY, ...parsed.entries };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // First run: no index yet — start with main only
        _entries = { main: MAIN_INDEX_ENTRY };
      } else {
        throw err;
      }
    }
    return _entries;
  }

  async function persist(): Promise<void> {
    const content: DriveIndexFile = {
      version: 1,
      entries: { ..._entries },
    };
    await mkdir(storeDir, { recursive: true });
    await writeFile(indexPath(storeDir), JSON.stringify(content, null, 2), 'utf-8');
  }

  function entries(): Record<string, DriveIndexEntry> {
    return _entries;
  }

  async function set(uuid: string, entry: DriveIndexEntry): Promise<void> {
    _entries[uuid] = entry;
    await persist();
  }

  async function remove(uuid: string): Promise<void> {
    if (uuid === 'main') throw new Error('Cannot remove the main drive');
    delete _entries[uuid];
    await persist();
  }

  return { entries, load, set, remove };
}
