import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { Test, type TestingModule } from '@nestjs/testing'
import { AppModule } from '../src/app.module.js'
import { HYPER_SDK } from '../src/hyper.infrastructure/sdk/hyper-sdk.module.js'
import { DriveService } from '../src/hyper.implementation/drives.service.js'
import { FileService } from '../src/hyper.implementation/file.service.js'

describe('AppModule', () => {
  let storagePath: string
  let originalStorageDir: string | undefined
  let moduleRef: TestingModule | undefined

  beforeEach(async () => {
    originalStorageDir = process.env.HYPER_STORAGE_DIR
    storagePath = await mkdtemp(join(tmpdir(), 'cinereel-hyper-client-'))
    process.env.HYPER_STORAGE_DIR = storagePath
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await moduleRef?.close()
    if (originalStorageDir === undefined) {
      delete process.env.HYPER_STORAGE_DIR
    } else {
      process.env.HYPER_STORAGE_DIR = originalStorageDir
    }
    vi.restoreAllMocks()
    await rm(storagePath, { recursive: true, force: true })
  })

  it('两个 Feature Service 共享 SDK，并在关闭时只关闭一次', async () => {
    const driveKey = 'd'.repeat(64)
    const getDrive = vi.fn(async () => ({
      key: Buffer.from(driveKey, 'hex'),
      name: 'movies',
      blobs: {},
      writable: false,
    }))
    const close = vi.fn(async () => undefined)
    const sdk = { drives: [], getDrive, close }

    moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot()],
    })
      .overrideProvider(HYPER_SDK)
      .useValue(sdk)
      .compile()
    await moduleRef.init()

    const driveService = moduleRef.get(DriveService, { strict: false })
    const fileService = moduleRef.get(FileService, { strict: false })

    await driveService.getDrive(driveKey)
    await expect(
      fileService.addFile(driveKey, '/movie.mkv', Readable.from('content')),
    ).resolves.toBe('drive-not-writable')
    expect(getDrive).toHaveBeenCalledTimes(2)

    await moduleRef.close()
    moduleRef = undefined
    expect(close).toHaveBeenCalledTimes(1)
  })
})
