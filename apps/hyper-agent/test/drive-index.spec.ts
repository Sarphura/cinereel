import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  FileSystemDriveIndexRepository,
  MAIN_INDEX_ENTRY,
} from '../src/repositories/drive-index.repository.js'

/**
 * ticket 07 — atomic drive-index writes + corrupt-index rejection.
 *
 * Acceptance criteria this suite pins:
 *   1. `set` and `delete` write to a temp file then rename (atomic).
 *   2. `load()` rejects half-formed index files with a clear error so the
 *      BootstrapService can exit 79 instead of silently dropping drives.
 *   3. A round-trip through `set → load` returns the same mirror.
 *   4. A round-trip through `set → remove → load` returns the same mirror
 *      without that entry.
 */
describe('FileSystemDriveIndexRepository — atomic writes + corrupt-index rejection', () => {
  let tmp: string
  let repo: FileSystemDriveIndexRepository

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'cinereel-index-'))
    repo = new FileSystemDriveIndexRepository(tmp)
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('round-trips set → load', async () => {
    await repo.set('uuid-movies', {
      name: 'movies',
      type: 'blob',
      createdAt: '2026-07-25T00:00:00.000Z',
    })
    const reloaded = new FileSystemDriveIndexRepository(tmp)
    const entries = await reloaded.load()
    expect(entries['uuid-movies']).toEqual({
      name: 'movies',
      type: 'blob',
      createdAt: '2026-07-25T00:00:00.000Z',
    })
    // main is always preserved.
    expect(entries['main']).toEqual(MAIN_INDEX_ENTRY)
  })

  it('round-trips set → remove → load', async () => {
    await repo.set('uuid-x', {
      name: 'x',
      type: 'metadata',
      createdAt: '2026-07-25T00:00:00.000Z',
    })
    await repo.remove('uuid-x')
    const reloaded = new FileSystemDriveIndexRepository(tmp)
    const entries = await reloaded.load()
    expect(entries['uuid-x']).toBeUndefined()
  })

  it('rejects a half-formed JSON (truncated file) with a clear error', async () => {
    writeFileSync(path.join(tmp, 'drive-index.json'), '{ "version": 1, "entries": { "uuid-a": { "nam', 'utf-8')
    await expect(repo.load()).rejects.toThrow(/drive-index\.json/)
  })

  it('rejects a syntactically-valid JSON with the wrong shape', async () => {
    // version is missing
    writeFileSync(
      path.join(tmp, 'drive-index.json'),
      JSON.stringify({ entries: {} }),
      'utf-8',
    )
    await expect(repo.load()).rejects.toThrow(/drive-index version/)
  })

  it('rejects an entry with an invalid type field', async () => {
    writeFileSync(
      path.join(tmp, 'drive-index.json'),
      JSON.stringify({
        version: 1,
        entries: { 'uuid-a': { name: 'a', type: 'wrong', createdAt: 'now' } },
      }),
      'utf-8',
    )
    await expect(repo.load()).rejects.toThrow(/invalid type/)
  })

  it('does not leave a temp file behind after a successful write', async () => {
    await repo.set('uuid-a', {
      name: 'a',
      type: 'metadata',
      createdAt: '2026-07-25T00:00:00.000Z',
    })
    const siblings = readFileSync(
      path.join(tmp, 'drive-index.json'),
      'utf-8',
    )
    // The target file is well-formed JSON
    expect(JSON.parse(siblings).version).toBe(1)
    // No `drive-index.json.tmp.*` siblings left behind
    const fs = await import('node:fs/promises')
    const all = await fs.readdir(tmp)
    expect(all.filter((f) => f.startsWith('drive-index.json.tmp.'))).toEqual([])
  })

  it('returns the empty (main-only) index when no file exists yet', async () => {
    const entries = await repo.load()
    expect(entries).toEqual({ main: MAIN_INDEX_ENTRY })
  })
})
