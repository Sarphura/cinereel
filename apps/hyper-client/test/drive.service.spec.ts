import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SDK } from 'hyper-sdk'
import { DriveService } from '../src/hyper.implementation/drives.service.js'

const DRIVE_KEYS_FILE = 'drive-keys.json'

describe('DriveService', () => {
  let storagePath: string
  let originalStorageDir: string | undefined

  beforeEach(async () => {
    originalStorageDir = process.env.HYPER_STORAGE_DIR
    storagePath = await mkdtemp(join(tmpdir(), 'cinereel-hyper-client-'))
    process.env.HYPER_STORAGE_DIR = storagePath
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    if (originalStorageDir === undefined) {
      delete process.env.HYPER_STORAGE_DIR
    } else {
      process.env.HYPER_STORAGE_DIR = originalStorageDir
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
      type: 'blob',
    })

    expect(getDrive).toHaveBeenCalledWith('movies')
    expect(result.driveKey).toBe(driveKey)
    await expect(
      readFile(join(storagePath, DRIVE_KEYS_FILE), 'utf-8').then(JSON.parse),
    ).resolves.toEqual([driveKey])
  })
})
