import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type AppBundle = Awaited<ReturnType<typeof import('../../app')['createApp']>>

const activeBundles: AppBundle[] = []
const activeStoreDirs: string[] = []

afterEach(async () => {
  while (activeBundles.length) {
    const bundle = activeBundles.pop()

    if (!bundle) {
      continue
    }

    await bundle.hyper.close()
    await bundle.app.close()
  }

  while (activeStoreDirs.length) {
    const storeDir = activeStoreDirs.pop()

    if (!storeDir) {
      continue
    }

    await fs.rm(storeDir, { recursive: true, force: true })
  }

  delete process.env.CORESTORE_DIR
  delete process.env.PORT
  vi.resetModules()
})

describe('drive controller', () => {
  it('deletes a local drive and rejects tree access afterwards', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-delete-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: {},
    })

    expect(createResponse.statusCode).toBe(200)

    const created = createResponse.json() as {
      data: { driveKey: string }
    }

    const driveKey = created.data.driveKey

    const listBeforeDelete = await bundle.app.inject({
      method: 'GET',
      url: '/api/drives',
    })

    expect(listBeforeDelete.statusCode).toBe(200)
    expect((listBeforeDelete.json() as { total: number }).total).toBe(1)

    const deleteResponse = await bundle.app.inject({
      method: 'DELETE',
      url: `/api/drives/${driveKey}`,
    })

    expect(deleteResponse.statusCode).toBe(200)
    expect((deleteResponse.json() as { data: { deleted: boolean } }).data.deleted).toBe(true)

    const listAfterDelete = await bundle.app.inject({
      method: 'GET',
      url: '/api/drives',
    })

    expect(listAfterDelete.statusCode).toBe(200)
    expect((listAfterDelete.json() as { total: number }).total).toBe(0)

    const treeAfterDelete = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/tree`,
    })

    expect(treeAfterDelete.statusCode).toBe(400)
    expect((treeAfterDelete.json() as { error: string }).error).toBe('找不到对应的 Drive。')
  }, 20_000)

  it('treats repeated delete on the same drive as success', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-delete-repeat-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: {},
    })

    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const firstDeleteResponse = await bundle.app.inject({
      method: 'DELETE',
      url: `/api/drives/${driveKey}`,
    })

    expect(firstDeleteResponse.statusCode).toBe(200)

    const secondDeleteResponse = await bundle.app.inject({
      method: 'DELETE',
      url: `/api/drives/${driveKey}`,
    })

    expect(secondDeleteResponse.statusCode).toBe(200)
    expect((secondDeleteResponse.json() as { data: { deleted: boolean; driveKey: string } }).data).toEqual({
      deleted: true,
      driveKey,
    })
  }, 20_000)
})
