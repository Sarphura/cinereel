import fs from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { getConfigDatabasePath } from '../../infra/config-store'
import { createControllerTestKit } from '../../../test/controller-test-kit'

const { cleanup, createAppBundle, createTempDir } = createControllerTestKit()

afterEach(cleanup)

describe('subscribed drive controller', () => {
  it('prefers the shared drive descriptor name over the stored subscribed drive name', async () => {
    const { bundle, storeDir } = await createAppBundle('cinereel-subscribed-drive-descriptor-')

    const driveKey = bundle.hyper.driveKey
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'profile',
      name: '共享名称',
      updatedAt: Date.now(),
    }, null, 2)))

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscribed-drives',
      payload: {
        driveKey,
        name: '本地旧名称',
      },
    })

    expect(createResponse.statusCode).toBe(200)
    expect((createResponse.json() as { data: { name?: string } }).data.name).toBe('共享名称')

    const db = new Database(getConfigDatabasePath(storeDir))
    const subscribedDrive = db.prepare(`
      SELECT name
      FROM subscribed_drives
      WHERE drive_key = ?
    `).get(driveKey) as { name: string } | undefined
    db.close()

    expect(subscribedDrive?.name).toBe('共享名称')

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

  it('reads subscribed drive type from the remote descriptor and exposes it via drives and storage', async () => {
    const { bundle, storeDir } = await createAppBundle('cinereel-subscribed-drive-')

    const driveKey = bundle.hyper.driveKey
    const name = '测试订阅源'
    const type = 'movie'
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'collection',
      name,
      type,
      ownerProfileDriveKey: 'f'.repeat(64),
      updatedAt: Date.now(),
    }, null, 2)))

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscribed-drives',
      payload: {
        driveKey,
        name,
      },
    })

    expect(createResponse.statusCode).toBe(200)
    expect((createResponse.json() as { data: { driveKey: string; name?: string; type: string } }).data).toMatchObject({
      driveKey,
      name,
      type,
    })

    const db = new Database(getConfigDatabasePath(storeDir))
    const subscribedDrive = db.prepare(`
      SELECT name, type
      FROM subscribed_drives
      WHERE drive_key = ?
    `).get(driveKey) as { name: string; type: string } | undefined
    db.close()

    expect(subscribedDrive).toMatchObject({
      name,
      type,
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
        type: string
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
        type: string
        isLocal: boolean
        publicationCount: number
        peerCount: number
        fileCount: number
        totalSize: number
      }>
    }).data[0]).toMatchObject({
      driveKey,
      name,
      type,
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

  it('syncs movie sidecar files into the local cache when subscribing', async () => {
    const { bundle } = await createAppBundle('cinereel-subscribed-drive-cache-')
    const cacheDir = await createTempDir('cinereel-cache-')
    process.env.CINEREEL_CACHE_DIR = cacheDir

    const driveKey = bundle.hyper.driveKey
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'collection',
      name: '电影合集',
      type: 'movie',
      ownerProfileDriveKey: 'f'.repeat(64),
      updatedAt: Date.now(),
    }, null, 2)))
    await bundle.hyper.drive.put('/Dune Part Two (2024)/poster.jpg', Buffer.from('poster-data'))
    await bundle.hyper.drive.put('/Dune Part Two (2024)/fanart.jpg', Buffer.from('fanart-data'))
    await bundle.hyper.drive.put('/Dune Part Two (2024)/movie.nfo', Buffer.from('nfo-data'))
    await bundle.hyper.drive.put('/Dune Part Two (2024)/feature.mkv', Buffer.from('video-data'))

    try {
      const createResponse = await bundle.app.inject({
        method: 'POST',
        url: '/api/subscribed-drives',
        payload: {
          driveKey,
        },
      })

      expect(createResponse.statusCode).toBe(200)

      const movieCacheDir = path.join(cacheDir, 'movies', 'Dune Part Two (2024)')
      expect(await fs.readFile(path.join(movieCacheDir, 'poster.jpg'), 'utf8')).toBe('poster-data')
      expect(await fs.readFile(path.join(movieCacheDir, 'fanart.jpg'), 'utf8')).toBe('fanart-data')
      expect(await fs.readFile(path.join(movieCacheDir, 'movie.nfo'), 'utf8')).toBe('nfo-data')
      await expect(fs.stat(path.join(movieCacheDir, 'feature.mkv'))).rejects.toThrow()

      const moviesResponse = await bundle.app.inject({
        method: 'GET',
        url: '/api/movies',
      })

      expect(moviesResponse.statusCode).toBe(200)
      expect((moviesResponse.json() as {
        data: Array<{
          driveKey: string
          resourcePath: string
          title?: string
          posterPath?: string
          nfoPath?: string
        }>
      }).data).toEqual([
        expect.objectContaining({
          driveKey,
          resourcePath: '/Dune Part Two (2024)',
          title: 'Dune Part Two (2024)',
          posterPath: '/Dune Part Two (2024)/poster.jpg',
          nfoPath: '/Dune Part Two (2024)/movie.nfo',
        }),
      ])

      const treeResponse = await bundle.app.inject({
        method: 'GET',
        url: `/api/drives/${driveKey}/tree`,
      })

      expect(treeResponse.statusCode).toBe(200)
      expect((treeResponse.json() as {
        data: {
          children?: Array<{
            path: string
            localDirPath?: string | null
            children?: Array<{
              path: string
              localDirPath?: string | null
            }>
          }>
        }
      }).data.children?.find((node) => node.path === '/Dune Part Two (2024)')).toMatchObject({
        path: '/Dune Part Two (2024)',
        localDirPath: path.join(cacheDir, 'movies'),
        children: expect.arrayContaining([
          expect.objectContaining({
            path: '/Dune Part Two (2024)/poster.jpg',
            localDirPath: movieCacheDir,
          }),
          expect.objectContaining({
            path: '/Dune Part Two (2024)/fanart.jpg',
            localDirPath: movieCacheDir,
          }),
          expect.objectContaining({
            path: '/Dune Part Two (2024)/movie.nfo',
            localDirPath: movieCacheDir,
          }),
        ]),
      })
    } finally {
      delete process.env.CINEREEL_CACHE_DIR
    }
  }, 30_000)

  it('deletes a subscribed drive and removes it from drives', async () => {
    const { bundle } = await createAppBundle('cinereel-subscribed-drive-delete-')
    const cacheDir = await createTempDir('cinereel-delete-cache-')
    process.env.CINEREEL_CACHE_DIR = cacheDir

    const driveKey = bundle.hyper.driveKey
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'collection',
      name: '待删除订阅',
      type: 'movie',
      ownerProfileDriveKey: 'f'.repeat(64),
      updatedAt: Date.now(),
    }, null, 2)))
    await bundle.hyper.drive.put('/Delete Me/poster.jpg', Buffer.from('poster-data'))

    try {
      const createResponse = await bundle.app.inject({
        method: 'POST',
        url: '/api/subscribed-drives',
        payload: {
          driveKey,
          name: '待删除订阅',
        },
      })

      expect(createResponse.statusCode).toBe(200)

      const moviesBeforeDelete = await bundle.app.inject({
        method: 'GET',
        url: '/api/movies',
      })

      expect((moviesBeforeDelete.json() as { data: unknown[] }).data).toHaveLength(1)

      const deleteResponse = await bundle.app.inject({
        method: 'DELETE',
        url: `/api/subscribed-drives/${driveKey}`,
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

      const moviesAfterDelete = await bundle.app.inject({
        method: 'GET',
        url: '/api/movies',
      })

      expect(moviesAfterDelete.statusCode).toBe(200)
      expect((moviesAfterDelete.json() as { data: unknown[] }).data).toHaveLength(0)
    } finally {
      delete process.env.CINEREEL_CACHE_DIR
    }
  }, 20_000)

  it('updates a subscribed drive remark without changing the displayed drive name', async () => {
    const { bundle } = await createAppBundle('cinereel-subscribed-drive-remark-')

    const driveKey = bundle.hyper.driveKey
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'profile',
      name: '远端真实名称',
      updatedAt: Date.now(),
    }, null, 2)))

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscribed-drives',
      payload: {
        driveKey,
      },
    })

    expect(createResponse.statusCode).toBe(200)

    const updateResponse = await bundle.app.inject({
      method: 'PATCH',
      url: `/api/subscribed-drives/${driveKey}`,
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
