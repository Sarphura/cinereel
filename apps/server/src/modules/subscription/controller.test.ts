import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConfigDatabasePath } from '../../infra/config-store'

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

describe('subscription controller', () => {
  it('prefers the shared drive descriptor name over the stored subscription name', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-subscription-descriptor-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const driveKey = bundle.hyper.driveKey
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'profile',
      name: '共享名称',
      updatedAt: Date.now(),
    }, null, 2)))

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey,
        name: '本地旧名称',
      },
    })

    expect(createResponse.statusCode).toBe(200)
    expect((createResponse.json() as { data: { name?: string } }).data.name).toBe('共享名称')

    const db = new Database(getConfigDatabasePath(storeDir))
    const subscription = db.prepare(`
      SELECT name
      FROM subscriptions
      WHERE drive_key = ?
    `).get(driveKey) as { name: string } | undefined
    db.close()

    expect(subscription?.name).toBe('共享名称')

    const listResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/drives',
    })

    expect(listResponse.statusCode).toBe(200)
    expect((listResponse.json() as {
      data: Array<{ driveKey: string; name: string }>
    }).data[0]).toMatchObject({
      driveKey,
      name: '共享名称',
    })

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/tree`,
    })

    expect(treeResponse.statusCode).toBe(200)
    expect((treeResponse.json() as { data: { name: string } }).data.name).toBe('共享名称')
  }, 30_000)

  it('creates a named subscription and exposes it via drives and tree', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-subscription-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const driveKey = 'a'.repeat(64)
    const name = '测试订阅源'

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey,
        name,
      },
    })

    expect(createResponse.statusCode).toBe(200)
    expect((createResponse.json() as { data: { driveKey: string; name?: string } }).data).toMatchObject({
      driveKey,
      name,
    })

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
    }).data).toHaveLength(1)
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
    }).data[0]).toMatchObject({
      driveKey,
      name,
      isLocal: false,
      publicationCount: 0,
      peerCount: 1,
      fileCount: 0,
      totalSize: 0,
    })

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/tree`,
    })

    expect(treeResponse.statusCode).toBe(200)
    expect((treeResponse.json() as { data: { name: string; path: string } }).data).toMatchObject({
      name,
      path: '/',
    })
  }, 30_000)

  it('deletes a subscription and removes it from drives', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-subscription-delete-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const driveKey = 'b'.repeat(64)

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey,
        name: '待删除订阅',
      },
    })

    expect(createResponse.statusCode).toBe(200)

    const deleteResponse = await bundle.app.inject({
      method: 'DELETE',
      url: `/api/subscriptions/${driveKey}`,
    })

    expect(deleteResponse.statusCode).toBe(200)
    expect((deleteResponse.json() as { data: { driveKey: string } }).data).toMatchObject({
      driveKey,
    })

    const listResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/drives',
    })

    expect(listResponse.statusCode).toBe(200)
    expect((listResponse.json() as { data: unknown[] }).data).toHaveLength(0)
  }, 20_000)

  it('updates a subscription remark without changing the displayed drive name', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-subscription-remark-'))
    activeStoreDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const driveKey = bundle.hyper.driveKey
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'profile',
      name: '远端真实名称',
      updatedAt: Date.now(),
    }, null, 2)))

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey,
      },
    })

    expect(createResponse.statusCode).toBe(200)

    const updateResponse = await bundle.app.inject({
      method: 'PATCH',
      url: `/api/subscriptions/${driveKey}`,
      payload: {
        remark: '影院片源',
      },
    })

    expect(updateResponse.statusCode).toBe(200)
    expect((updateResponse.json() as { data: { driveKey: string; remark?: string } }).data).toMatchObject({
      driveKey,
      remark: '影院片源',
    })

    const listResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/drives',
    })

    expect(listResponse.statusCode).toBe(200)
    expect((listResponse.json() as {
      data: Array<{ driveKey: string; name: string; remark?: string }>
    }).data[0]).toMatchObject({
      driveKey,
      name: '远端真实名称',
      remark: '影院片源',
    })
  }, 20_000)

})
