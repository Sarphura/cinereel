import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SDK } from 'hyper-sdk'
import { DriveService } from '../src/hyper.implementation/drives.service.js'

const DRIVE_KEYS_FILE = 'drive-keys.json'

describe('DriveService', () => {
  let storagePath: string
  let originalConfigDir: string | undefined

  beforeEach(async () => {
    originalConfigDir = process.env.CONFIG_DIR
    storagePath = await mkdtemp(join(tmpdir(), 'cinereel-hyper-client-'))
    process.env.CONFIG_DIR = storagePath
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    if (originalConfigDir === undefined) {
      delete process.env.CONFIG_DIR
    } else {
      process.env.CONFIG_DIR = originalConfigDir
    }
    vi.restoreAllMocks()
    await rm(storagePath, { recursive: true, force: true })
  })

  it('启动时通过 SDK 恢复已记录的 Drive', async () => {
    const driveKeys = ['a'.repeat(64), 'b'.repeat(64)]
    await writeFile(
      join(storagePath, DRIVE_KEYS_FILE),
      JSON.stringify(driveKeys),
      'utf-8',
    )
    const getDrive = vi.fn(async () => ({ key: Buffer.alloc(32) }))
    const service = new DriveService({ getDrive } as unknown as SDK)

    await service.onModuleInit()

    expect(getDrive).toHaveBeenCalledTimes(2)
    expect(getDrive).toHaveBeenNthCalledWith(1, driveKeys[0])
    expect(getDrive).toHaveBeenNthCalledWith(2, driveKeys[1])
  })

  it('创建 Drive 后持久化 SDK 返回的 key', async () => {
    const driveKey = 'c'.repeat(64)
    const getDrive = vi.fn(async () => ({
      key: Buffer.from(driveKey, 'hex'),
    }))
    const service = new DriveService({ getDrive } as unknown as SDK)

    const result = await service.createDrive({
      namespace: 'movies',
      name: '电影',
    })

    expect(getDrive).toHaveBeenCalledWith('movies')
    expect(result.driveKey).toBe(driveKey)
    await expect(
      readFile(join(storagePath, DRIVE_KEYS_FILE), 'utf-8').then(JSON.parse),
    ).resolves.toEqual([driveKey])
  })

  it('purge 成功后才移除 Drive key', async () => {
    const driveKey = 'd'.repeat(64)
    await writeFile(
      join(storagePath, DRIVE_KEYS_FILE),
      JSON.stringify([driveKey]),
      'utf-8',
    )
    const purge = vi.fn(async () => undefined)
    const leave = vi.fn(async () => undefined)
    const service = new DriveService({
      getDrive: vi.fn(async () => ({
        key: Buffer.from(driveKey, 'hex'),
        discoveryKey: Buffer.alloc(32),
        purge,
      })),
      leave,
    } as unknown as SDK)

    await expect(service.purgeDriveForTest(driveKey)).resolves.toEqual({
      ok: true,
      driveKey,
      method: 'drive.purge',
    })
    expect(leave).toHaveBeenCalledTimes(1)
    expect(purge).toHaveBeenCalledTimes(1)
    await expect(
      readFile(join(storagePath, DRIVE_KEYS_FILE), 'utf-8').then(JSON.parse),
    ).resolves.toEqual([])
  })

  it('purge 失败时返回错误并保留 Drive key', async () => {
    const driveKey = 'e'.repeat(64)
    await writeFile(
      join(storagePath, DRIVE_KEYS_FILE),
      JSON.stringify([driveKey]),
      'utf-8',
    )
    const service = new DriveService({
      getDrive: vi.fn(async () => ({
        key: Buffer.from(driveKey, 'hex'),
        discoveryKey: Buffer.alloc(32),
        purge: vi.fn(async () => {
          throw new TypeError('this._closeAllSessions is not a function')
        }),
      })),
      leave: vi.fn(async () => undefined),
    } as unknown as SDK)

    await expect(service.purgeDriveForTest(driveKey)).resolves.toEqual({
      ok: false,
      driveKey,
      method: 'drive.purge',
      error: 'this._closeAllSessions is not a function',
    })
    await expect(
      readFile(join(storagePath, DRIVE_KEYS_FILE), 'utf-8').then(JSON.parse),
    ).resolves.toEqual([driveKey])
  })

  it('清理 blob 后保留 Drive key', async () => {
    const driveKey = 'f'.repeat(64)
    const clearAll = vi.fn(async () => ({ blocks: 0 }))
    const compact = vi.fn(async () => undefined)
    const service = new DriveService({
      getDrive: vi.fn(async () => ({
        key: Buffer.from(driveKey, 'hex'),
        discoveryKey: Buffer.alloc(32),
        clearAll,
        blobs: { core: { length: 12, compact } },
      })),
      leave: vi.fn(async () => undefined),
    } as unknown as SDK)

    await expect(service.clearDriveBlobs(driveKey)).resolves.toEqual({
      ok: true,
      driveKey,
      clearedBlocks: 12,
      compacted: true,
    })
    expect(clearAll).toHaveBeenCalledWith({ diff: true })
    expect(compact).toHaveBeenCalledTimes(1)
  })
})
