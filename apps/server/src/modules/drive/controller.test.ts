import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import Hyperdrive from 'hyperdrive'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as publicationService from '../publication/service'
import { getConfigDatabasePath } from '../../infra/config-store'

type AppBundle = Awaited<ReturnType<typeof import('../../app')['createApp']>>

const activeBundles: AppBundle[] = []
const activeStoreDirs: string[] = []

async function waitForMountJob(
  bundle: AppBundle,
  jobId: string,
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const statusResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/mount/${jobId}`,
    })

    expect(statusResponse.statusCode).toBe(200)
    const job = (statusResponse.json() as {
      data: {
        status: 'queued' | 'mounting' | 'completed' | 'failed'
        error: string | null
      }
    }).data

    if (job.status === 'completed' || job.status === 'failed') {
      return job
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('挂载任务超时。')
}

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
  it('keeps drives listing available when a subscribed manifest block is unavailable', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-list-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const unavailableError = Object.assign(new Error('BLOCK_NOT_AVAILABLE: Block is not available'), {
      code: 'BLOCK_NOT_AVAILABLE',
    })
    const listPublishedResourcesSpy = vi
      .spyOn(publicationService, 'listPublishedResources')
      .mockRejectedValueOnce(unavailableError)

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const driveKey = 'b'.repeat(64)

    const subscribeResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: { driveKey, name: '远端订阅' },
    })

    expect(subscribeResponse.statusCode).toBe(200)

    const listResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/drives',
    })

    expect(listResponse.statusCode).toBe(200)
    expect((listResponse.json() as {
      data: Array<{
        driveKey: string
        name: string
        isLocal: boolean
        publicationCount: number
        peerCount: number
        fileCount: number
        totalSize: number
      }>
    }).data).toEqual([
      {
        driveKey,
        name: '远端订阅',
        isLocal: false,
        publicationCount: 0,
        peerCount: 1,
        fileCount: 0,
        totalSize: 0,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    ])

    listPublishedResourcesSpy.mockRestore()
  }, 30_000)

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

  it('creates a collection descriptor inside the drive and syncs it into the profile index', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-descriptor-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const name = '我的共享媒体库'
    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name },
    })

    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const db = new Database(getConfigDatabasePath(storeDir), { readonly: true })
    const localDrives = (db.prepare(`
      SELECT drive_key, namespace
      FROM owned_drives
    `).all() as Array<{ drive_key: string; namespace: string }>).map((record) => ({
      driveKey: record.drive_key,
      namespace: record.namespace,
    }))
    const localDrive = localDrives.find((record) => record.driveKey === driveKey)
    expect(localDrive).toBeDefined()
    db.close()

    const driveStore = bundle.hyper.store.namespace(localDrive!.namespace)
    const drive = new Hyperdrive(driveStore)
    await drive.ready()

    const descriptorBuffer = await drive.get('/.cinereel/descriptor.json')
    expect(descriptorBuffer).not.toBeNull()
    expect(JSON.parse(descriptorBuffer!.toString())).toMatchObject({
      schemaVersion: 1,
      kind: 'collection',
      name,
      ownerProfileDriveKey: bundle.hyper.driveKey,
      updatedAt: expect.any(Number),
    })
    await drive.close()
    await driveStore.close()

    const profileResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/profile',
    })

    expect(profileResponse.statusCode).toBe(200)
    expect((profileResponse.json() as {
      data: {
        driveKey: string
        collections: Array<{ driveKey: string; name: string }>
      }
    }).data).toMatchObject({
      driveKey: bundle.hyper.driveKey,
      collections: [
        {
          driveKey,
          name,
        },
      ],
    })

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/tree`,
    })

    expect(treeResponse.statusCode).toBe(200)
    expect((treeResponse.json() as {
      data: {
        children?: Array<{ path: string }>
      }
    }).data.children ?? []).toEqual([])
  }, 20_000)

  it('reads a drive descriptor through the debug endpoint', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-descriptor-endpoint-'))
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
      payload: { name: '调试描述测试' },
    })

    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const descriptorResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/descriptor`,
    })

    expect(descriptorResponse.statusCode).toBe(200)
    expect((descriptorResponse.json() as {
      data: {
        schemaVersion: 1
        kind: 'collection'
        name: string
        ownerProfileDriveKey: string
        updatedAt: number
      }
    }).data).toMatchObject({
      schemaVersion: 1,
      kind: 'collection',
      name: '调试描述测试',
      ownerProfileDriveKey: bundle.hyper.driveKey,
      updatedAt: expect.any(Number),
    })
  }, 20_000)

  it('reads profile.json and collections.json through drive-scoped profile endpoints', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-profile-endpoints-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const updateProfileResponse = await bundle.app.inject({
      method: 'PATCH',
      url: '/api/profile',
      payload: {
        name: 'Lynn',
        bio: 'Profile root',
      },
    })

    expect(updateProfileResponse.statusCode).toBe(200)

    const createDriveResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name: '合集 A' },
    })

    expect(createDriveResponse.statusCode).toBe(200)
    const collectionDriveKey = (createDriveResponse.json() as {
      data: {
        driveKey: string
      }
    }).data.driveKey

    const profileDocumentResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/profile/document`,
    })

    const profileCollectionsResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/profile/collections`,
    })

    expect(profileDocumentResponse.statusCode).toBe(200)
    expect((profileDocumentResponse.json() as {
      data: {
        name: string
        bio: string
        avatarPath: string | null
      }
    }).data).toMatchObject({
      name: 'Lynn',
      bio: 'Profile root',
      avatarPath: null,
    })

    expect(profileCollectionsResponse.statusCode).toBe(200)
    expect((profileCollectionsResponse.json() as {
      data: {
        items: Array<{
          driveKey: string
          name: string
        }>
      }
    }).data.items[0]).toMatchObject({
      driveKey: collectionDriveKey,
      name: '合集 A',
    })
  }, 20_000)

  it('renames a local drive and syncs the descriptor file', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-rename-'))
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
      payload: { name: '原始名称' },
    })

    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const renameResponse = await bundle.app.inject({
      method: 'PATCH',
      url: `/api/drives/${driveKey}`,
      payload: { name: '新的共享名称' },
    })

    expect(renameResponse.statusCode).toBe(200)
    expect((renameResponse.json() as { data: { name: string } }).data.name).toBe('新的共享名称')

    const db = new Database(getConfigDatabasePath(storeDir), { readonly: true })
    const localDrives = (db.prepare(`
      SELECT drive_key, namespace, name
      FROM owned_drives
    `).all() as Array<{ drive_key: string; namespace: string; name: string }>).map((record) => ({
      driveKey: record.drive_key,
      namespace: record.namespace,
      name: record.name,
    }))
    const localDrive = localDrives.find((record) => record.driveKey === driveKey)
    expect(localDrive?.name).toBe('新的共享名称')
    db.close()

    const driveStore = bundle.hyper.store.namespace(localDrive!.namespace)
    const drive = new Hyperdrive(driveStore)
    await drive.ready()

    const descriptorBuffer = await drive.get('/.cinereel/descriptor.json')
    expect(JSON.parse(descriptorBuffer!.toString())).toMatchObject({
      schemaVersion: 1,
      kind: 'collection',
      name: '新的共享名称',
      ownerProfileDriveKey: bundle.hyper.driveKey,
      updatedAt: expect.any(Number),
    })

    await drive.close()
    await driveStore.close()

    const profileResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/profile',
    })

    expect(profileResponse.statusCode).toBe(200)
    expect((profileResponse.json() as {
      data: {
        collections: Array<{ driveKey: string; name: string }>
      }
    }).data.collections[0]).toMatchObject({
      driveKey,
      name: '新的共享名称',
    })
  }, 20_000)

  it('updates an owned drive remark without changing the displayed drive name', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-remark-'))
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
      payload: { name: '本地真实名称' },
    })

    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const updateResponse = await bundle.app.inject({
      method: 'PATCH',
      url: `/api/drives/${driveKey}`,
      payload: {
        remark: '我的备注',
      },
    })

    expect(updateResponse.statusCode).toBe(200)
    expect((updateResponse.json() as { data: { driveKey: string; name: string; remark?: string } }).data).toMatchObject({
      driveKey,
      name: '本地真实名称',
      remark: '我的备注',
    })

    const listResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/drives',
    })

    expect(listResponse.statusCode).toBe(200)
    expect((listResponse.json() as {
      data: Array<{ driveKey: string; name: string; remark?: string }>
    }).data.find((record) => record.driveKey === driveKey)).toMatchObject({
      driveKey,
      name: '本地真实名称',
      remark: '我的备注',
    })
  }, 20_000)

  it('serves the last published snapshot until the drive is mounted again', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-refresh-'))
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-drive-source-'))
    activeStoreDirs.push(storeDir)
    activeStoreDirs.push(sourceDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    await fs.writeFile(path.join(sourceDir, 'first.mp4'), 'video-1')

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name: '测试 Drive' },
    })

    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const mountResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/mount',
      payload: {
        driveKey,
        targetPath: sourceDir,
      },
    })

    expect(mountResponse.statusCode).toBe(200)
    expect(await waitForMountJob(
      bundle,
      (mountResponse.json() as { data: { id: string } }).data.id,
    )).toMatchObject({
      status: 'completed',
      error: null,
    })

    await fs.writeFile(path.join(sourceDir, 'second.mp4'), 'video-2')

    const staleTreeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/tree`,
    })

    expect(staleTreeResponse.statusCode).toBe(200)
    const staleTree = (staleTreeResponse.json() as {
      data: {
        children?: Array<{
          path: string
          children?: Array<{ path: string }>
        }>
      }
    }).data

    expect(staleTree.children).toHaveLength(1)
    expect(staleTree.children?.[0]).toEqual(expect.objectContaining({
      path: `/${path.basename(sourceDir)}`,
      localDirPath: sourceDir,
      children: [
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/first.mp4`,
          localDirPath: path.join(sourceDir, 'first.mp4'),
        }),
      ],
    }))

    const remountResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/mount',
      payload: {
        driveKey,
        targetPath: sourceDir,
      },
    })

    expect(remountResponse.statusCode).toBe(200)
    expect(await waitForMountJob(
      bundle,
      (remountResponse.json() as { data: { id: string } }).data.id,
    )).toMatchObject({
      status: 'completed',
      error: null,
    })

    const refreshedTreeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/tree`,
    })

    expect(refreshedTreeResponse.statusCode).toBe(200)
    const refreshedTree = (refreshedTreeResponse.json() as {
      data: {
        children?: Array<{
          path: string
          children?: Array<{ path: string }>
        }>
      }
    }).data

    expect(refreshedTree.children?.[0]).toEqual(expect.objectContaining({
      path: `/${path.basename(sourceDir)}`,
      localDirPath: sourceDir,
      children: expect.arrayContaining([
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/first.mp4`,
          localDirPath: path.join(sourceDir, 'first.mp4'),
        }),
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/second.mp4`,
          localDirPath: path.join(sourceDir, 'second.mp4'),
        }),
      ]),
    }))
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
