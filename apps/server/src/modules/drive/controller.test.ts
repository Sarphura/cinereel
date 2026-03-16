import fs from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import Hyperdrive from 'hyperdrive'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as publicationService from '../publication/service'
import { getConfigDatabasePath } from '../../infra/config-store'
import { MEDIA_INDEX_PATH, SCAN_STATUS_PATH } from '../scan/store'
import { createControllerTestKit } from '../../../test/controller-test-kit'

type AppBundle = Awaited<ReturnType<typeof import('../../app')['createApp']>>

const { cleanup, createAppBundle, createTempDir } = createControllerTestKit()

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

async function waitForScanJob(
  bundle: AppBundle,
  jobId: string,
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const statusResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/scans/${jobId}`,
    })

    expect(statusResponse.statusCode).toBe(200)
    const job = (statusResponse.json() as {
      data: {
        status: 'queued' | 'scanning' | 'completed' | 'failed'
        error: string | null
        failedFiles: Array<{ path: string; error: string }>
      }
    }).data

    if (job.status === 'completed' || job.status === 'failed') {
      return job
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('扫描任务超时。')
}

afterEach(cleanup)

describe('drive controller', () => {
  it('keeps drives listing available when a subscribed manifest block is unavailable', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-list-')

    const unavailableError = Object.assign(new Error('BLOCK_NOT_AVAILABLE: Block is not available'), {
      code: 'BLOCK_NOT_AVAILABLE',
    })
    const listPublishedResourcesSpy = vi
      .spyOn(publicationService, 'listPublishedResources')
      .mockRejectedValueOnce(unavailableError)

    const driveKey = bundle.hyper.driveKey
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'collection',
      name: '远端订阅',
      type: 'movie',
      ownerProfileDriveKey: 'f'.repeat(64),
      updatedAt: Date.now(),
    }, null, 2)))

    const subscribeResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscribed-drives',
      payload: { driveKey },
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
        type: 'movie',
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
    const { bundle } = await createAppBundle('cinereel-drive-delete-')

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
    const { bundle, storeDir } = await createAppBundle('cinereel-drive-descriptor-')

    const name = '我的共享媒体库'
    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name, type: 'movie' },
    })

    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const db = new Database(getConfigDatabasePath(storeDir), { readonly: true })
    const ownedDrives = (db.prepare(`
      SELECT drive_key, namespace
      FROM owned_drives
    `).all() as Array<{ drive_key: string; namespace: string }>).map((record) => ({
      driveKey: record.drive_key,
      namespace: record.namespace,
    }))
    const ownedDrive = ownedDrives.find((record) => record.driveKey === driveKey)
    expect(ownedDrive).toBeDefined()
    db.close()

    const driveStore = bundle.hyper.store.namespace(ownedDrive!.namespace)
    const drive = new Hyperdrive(driveStore)
    await drive.ready()

    const descriptorBuffer = await drive.get('/.cinereel/descriptor.json')
    expect(descriptorBuffer).not.toBeNull()
    expect(JSON.parse(descriptorBuffer!.toString())).toMatchObject({
      schemaVersion: 1,
      kind: 'collection',
      type: 'movie',
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
    const { bundle } = await createAppBundle('cinereel-drive-descriptor-endpoint-')

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
        type: 'movie' | 'series' | 'music' | 'generic'
        name: string
        ownerProfileDriveKey: string
        updatedAt: number
      }
    }).data).toMatchObject({
      schemaVersion: 1,
      kind: 'collection',
      type: 'generic',
      name: '调试描述测试',
      ownerProfileDriveKey: bundle.hyper.driveKey,
      updatedAt: expect.any(Number),
    })
  }, 20_000)

  it('reads profile.json and collections.json through drive-scoped profile endpoints', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-profile-endpoints-')

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
    const { bundle, storeDir } = await createAppBundle('cinereel-drive-rename-')

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
    const ownedDrives = (db.prepare(`
      SELECT drive_key, namespace, name
      FROM owned_drives
    `).all() as Array<{ drive_key: string; namespace: string; name: string }>).map((record) => ({
      driveKey: record.drive_key,
      namespace: record.namespace,
      name: record.name,
    }))
    const ownedDrive = ownedDrives.find((record) => record.driveKey === driveKey)
    expect(ownedDrive?.name).toBe('新的共享名称')
    db.close()

    const driveStore = bundle.hyper.store.namespace(ownedDrive!.namespace)
    const drive = new Hyperdrive(driveStore)
    await drive.ready()

    const descriptorBuffer = await drive.get('/.cinereel/descriptor.json')
    expect(JSON.parse(descriptorBuffer!.toString())).toMatchObject({
      schemaVersion: 1,
      kind: 'collection',
      type: 'generic',
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

  it('creates a scan job for movie drives after mount and writes media index', async () => {
    const { bundle, storeDir } = await createAppBundle('cinereel-drive-scan-success-')
    const sourceDir = await createTempDir('cinereel-drive-scan-source-')

    await fs.writeFile(path.join(sourceDir, 'movie.mp4'), 'video-data')
    const ffprobeModule = await import('../scan/ffprobe')
    vi.spyOn(ffprobeModule, 'probeMediaFile').mockResolvedValue({
      path: `/${path.basename(sourceDir)}/movie.mp4`,
      fileName: 'movie.mp4',
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
      size: 10,
      durationSeconds: 120,
      bitRate: 4096,
      video: [],
      audio: [],
      subtitles: [],
      scannedAt: Date.now(),
    })

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name: '电影库', type: 'movie' },
    })
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const mountResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/mount',
      payload: {
        driveKey,
        targetPath: sourceDir,
      },
    })

    const mountJob = await waitForMountJob(bundle, (mountResponse.json() as { data: { id: string } }).data.id)
    expect(mountJob).toMatchObject({
      status: 'completed',
      error: null,
    })

    const scansResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/scans',
    })
    expect(scansResponse.statusCode).toBe(200)
    const scanId = (scansResponse.json() as { data: Array<{ id: string }> }).data[0]?.id
    expect(scanId).toBeTruthy()

    const scanJob = await waitForScanJob(bundle, scanId!)
    expect(scanJob).toMatchObject({
      status: 'completed',
      error: null,
      failedFiles: [],
    })

    const descriptorResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/drives',
    })
    expect(descriptorResponse.statusCode).toBe(200)
    expect((descriptorResponse.json() as {
      data: Array<{ driveKey: string; type: string }>
    }).data.find((record) => record.driveKey === driveKey)).toMatchObject({
      driveKey,
      type: 'movie',
    })

    const db = new Database(getConfigDatabasePath(storeDir), { readonly: true })
    const ownedDrive = (db.prepare(`
      SELECT namespace
      FROM owned_drives
      WHERE drive_key = ?
    `).get(driveKey) as { namespace: string })
    db.close()

    const driveStore = bundle.hyper.store.namespace(ownedDrive.namespace)
    const drive = new Hyperdrive(driveStore)
    await drive.ready()

    const mediaIndexBuffer = await drive.get(MEDIA_INDEX_PATH)
    const scanStatusBuffer = await drive.get(SCAN_STATUS_PATH)

    expect(JSON.parse(mediaIndexBuffer!.toString())).toMatchObject({
      items: {
        [`/${path.basename(sourceDir)}/movie.mp4`]: {
          durationSeconds: 120,
        },
      },
    })
    expect(JSON.parse(scanStatusBuffer!.toString())).toMatchObject({
      roots: [
        expect.objectContaining({
          rootPath: `/${path.basename(sourceDir)}`,
          status: 'completed',
          failedFiles: [],
        }),
      ],
    })

    await drive.close()
    await driveStore.close()
  }, 20_000)

  it('reads ffprobe media index for a specified drive and supports path filtering', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-media-index-endpoint-')
    const sourceDir = await createTempDir('cinereel-drive-media-index-source-')
    const nestedDir = path.join(sourceDir, 'extras')
    const cacheDir = await createTempDir('cinereel-drive-media-index-cache-')

    await fs.mkdir(nestedDir)
    await fs.writeFile(path.join(sourceDir, 'movie.mp4'), 'video-data')
    await fs.writeFile(path.join(nestedDir, 'trailer.mkv'), 'video-data')
    process.env.CINEREEL_CACHE_DIR = cacheDir

    const ffprobeModule = await import('../scan/ffprobe')
    vi.spyOn(ffprobeModule, 'probeMediaFile').mockImplementation(async (_localPath, resourcePath) => ({
      path: resourcePath,
      fileName: path.basename(resourcePath),
      container: 'matroska,webm',
      size: 10,
      durationSeconds: resourcePath.endsWith('movie.mp4') ? 120 : 30,
      bitRate: 4096,
      video: [],
      audio: [],
      subtitles: [],
      scannedAt: Date.now(),
    }))

    try {
      const createResponse = await bundle.app.inject({
        method: 'POST',
        url: '/api/drives',
        payload: { name: '电影库', type: 'movie' },
      })
      expect(createResponse.statusCode).toBe(200)
      const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

      const cacheMovieDir = path.join(cacheDir, 'movies', path.basename(sourceDir))
      await fs.mkdir(cacheMovieDir, { recursive: true })
      await fs.writeFile(path.join(cacheMovieDir, 'poster.jpg'), 'poster-data')
      await fs.writeFile(path.join(cacheMovieDir, 'movie.nfo'), `<?xml version="1.0" encoding="UTF-8"?>
<movie>
  <title>Movie Title</title>
  <originaltitle>Original Movie Title</originaltitle>
  <plot>Movie plot.</plot>
  <year>2024</year>
  <premiered>2024-01-01</premiered>
  <rating>8.3</rating>
</movie>`)

      const mountResponse = await bundle.app.inject({
        method: 'POST',
        url: '/api/mount',
        payload: {
          driveKey,
          targetPath: sourceDir,
        },
      })

      const mountJob = await waitForMountJob(bundle, (mountResponse.json() as { data: { id: string } }).data.id)
      expect(mountJob).toMatchObject({
        status: 'completed',
        error: null,
      })

      const scansResponse = await bundle.app.inject({
        method: 'GET',
        url: '/api/scans',
      })
      const scanId = (scansResponse.json() as { data: Array<{ id: string }> }).data[0]?.id
      expect(scanId).toBeTruthy()

      const scanJob = await waitForScanJob(bundle, scanId!)
      expect(scanJob.status).toBe('completed')

      const allMediaIndexResponse = await bundle.app.inject({
        method: 'GET',
        url: `/api/drives/${driveKey}/media-index`,
      })

      expect(allMediaIndexResponse.statusCode).toBe(200)
      expect((allMediaIndexResponse.json() as {
        data: {
          driveKey: string
          path: string | null
          total: number
          items: Array<{
            path: string
            durationSeconds: number
            metadata?: {
              title?: string | null
              year?: number | null
              posterPath?: string | null
              nfoPath?: string | null
            } | null
          }>
        }
      }).data).toMatchObject({
        driveKey,
        path: null,
        total: 2,
        items: [
          {
            path: `/${path.basename(sourceDir)}/extras/trailer.mkv`,
            durationSeconds: 30,
            metadata: {
              title: 'Movie Title',
              year: 2024,
              posterPath: `/${path.basename(sourceDir)}/poster.jpg`,
              nfoPath: `/${path.basename(sourceDir)}/movie.nfo`,
            },
          },
          {
            path: `/${path.basename(sourceDir)}/movie.mp4`,
            durationSeconds: 120,
            metadata: {
              title: 'Movie Title',
              year: 2024,
              posterPath: `/${path.basename(sourceDir)}/poster.jpg`,
              nfoPath: `/${path.basename(sourceDir)}/movie.nfo`,
            },
          },
        ],
      })

      const filteredMediaIndexResponse = await bundle.app.inject({
        method: 'GET',
        url: `/api/drives/${driveKey}/media-index`,
        query: {
          path: `/${path.basename(sourceDir)}/extras`,
        },
      })

      expect(filteredMediaIndexResponse.statusCode).toBe(200)
      expect((filteredMediaIndexResponse.json() as {
        data: {
          path: string | null
          total: number
          items: Array<{
            path: string
            durationSeconds: number
            metadata?: {
              title?: string | null
            } | null
          }>
        }
      }).data).toMatchObject({
        path: `/${path.basename(sourceDir)}/extras`,
        total: 1,
        items: [
          {
            path: `/${path.basename(sourceDir)}/extras/trailer.mkv`,
            durationSeconds: 30,
            metadata: {
              title: 'Movie Title',
            },
          },
        ],
      })
    } finally {
      delete process.env.CINEREEL_CACHE_DIR
    }
  }, 20_000)

  it('returns an empty ffprobe media index when the drive has not generated scan data yet', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-media-index-empty-')

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name: '空电影库', type: 'movie' },
    })
    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const response = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/media-index`,
    })

    expect(response.statusCode).toBe(200)
    expect((response.json() as {
      data: {
        driveKey: string
        path: string | null
        total: number
        items: unknown[]
      }
    }).data).toEqual({
      driveKey,
      version: 1,
      path: null,
      total: 0,
      items: [],
    })
  }, 20_000)

  it('falls back to an empty media index for subscribed movie drives when remote data is unavailable', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-media-index-remote-fallback-')

    const driveKey = bundle.hyper.driveKey
    await bundle.hyper.drive.put('/.cinereel/descriptor.json', Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: 'collection',
      name: '远端电影库',
      type: 'movie',
      ownerProfileDriveKey: 'f'.repeat(64),
      updatedAt: Date.now(),
    }, null, 2)))

    const subscribeResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscribed-drives',
      payload: { driveKey },
    })

    expect(subscribeResponse.statusCode).toBe(200)

    await bundle.hyper.drive.del(MEDIA_INDEX_PATH)

    const response = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/media-index`,
    })

    expect(response.statusCode).toBe(200)
    expect((response.json() as {
      data: {
        driveKey: string
        version: number
        path: string | null
        total: number
        items: unknown[]
      }
    }).data).toEqual({
      driveKey,
      version: 1,
      path: null,
      total: 0,
      items: [],
    })
  }, 20_000)

  it('rolls back mounted files when movie scan fails', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-scan-fail-')
    const sourceDir = await createTempDir('cinereel-drive-scan-fail-source-')

    await fs.writeFile(path.join(sourceDir, 'broken.mp4'), 'video-data')
    const ffprobeModule = await import('../scan/ffprobe')
    vi.spyOn(ffprobeModule, 'probeMediaFile').mockRejectedValue(new Error('ffprobe missing'))

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name: '失败电影库', type: 'movie' },
    })
    const driveKey = (createResponse.json() as { data: { driveKey: string } }).data.driveKey

    const mountResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/mount',
      payload: {
        driveKey,
        targetPath: sourceDir,
      },
    })

    await waitForMountJob(bundle, (mountResponse.json() as { data: { id: string } }).data.id)
    const scanId = ((await bundle.app.inject({
      method: 'GET',
      url: '/api/scans',
    })).json() as { data: Array<{ id: string }> }).data[0]?.id
    const scanJob = await waitForScanJob(bundle, scanId!)

    expect(scanJob.status).toBe('failed')
    expect(scanJob.failedFiles[0]).toMatchObject({
      path: `/${path.basename(sourceDir)}/broken.mp4`,
      error: 'ffprobe missing',
    })

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/tree`,
    })
    expect(treeResponse.statusCode).toBe(200)
    expect((treeResponse.json() as { data: { children?: unknown[] } }).data.children ?? []).toEqual([])
  }, 20_000)

  it('mounts local directories by metadata without copying large files into the drive', async () => {
    const { bundle, storeDir } = await createAppBundle('cinereel-drive-large-mount-')
    const sourceDir = await createTempDir('cinereel-drive-large-source-')
    const hugeVideoName = 'huge-video.mkv'
    const hugeVideoSize = 27 * 1024 * 1024 * 1024

    await fs.writeFile(path.join(sourceDir, hugeVideoName), '')
    await fs.truncate(path.join(sourceDir, hugeVideoName), hugeVideoSize)

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name: '大文件目录' },
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
      totalFiles: 1,
      totalBytes: hugeVideoSize,
    })

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
            size: number
            localDirPath?: string | null
          }>
        }>
      }
    }).data.children?.[0]).toEqual(expect.objectContaining({
      path: `/${path.basename(sourceDir)}`,
      localDirPath: path.dirname(sourceDir),
      children: [
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/${hugeVideoName}`,
          size: hugeVideoSize,
          localDirPath: sourceDir,
        }),
      ],
    }))

    const db = new Database(getConfigDatabasePath(storeDir), { readonly: true })
    const ownedDrive = (db.prepare(`
      SELECT namespace
      FROM owned_drives
      WHERE drive_key = ?
    `).get(driveKey) as { namespace: string })
    db.close()

    const driveStore = bundle.hyper.store.namespace(ownedDrive.namespace)
    const drive = new Hyperdrive(driveStore)
    await drive.ready()

    expect(await drive.entry(`/${path.basename(sourceDir)}/${hugeVideoName}`, { wait: false })).toBeNull()

    await drive.close()
    await driveStore.close()
  }, 20_000)

  it('updates an owned drive remark without changing the displayed drive name', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-remark-')

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

  it('refreshes mounted local directories into the resource tree when source files change', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-refresh-')
    const sourceDir = await createTempDir('cinereel-drive-source-')

    await fs.writeFile(path.join(sourceDir, 'first.mp4'), 'video-1')

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

    const liveTreeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/tree`,
    })

    expect(liveTreeResponse.statusCode).toBe(200)
    const liveTree = (liveTreeResponse.json() as {
      data: {
        children?: Array<{
          path: string
          children?: Array<{ path: string }>
        }>
      }
    }).data

    expect(liveTree.children).toHaveLength(1)
    expect(liveTree.children?.[0]).toEqual(expect.objectContaining({
      path: `/${path.basename(sourceDir)}`,
      localDirPath: path.dirname(sourceDir),
      children: expect.arrayContaining([
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/first.mp4`,
          localDirPath: sourceDir,
        }),
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/second.mp4`,
          localDirPath: sourceDir,
        }),
      ]),
    }))

    const refreshResponse = await bundle.app.inject({
      method: 'POST',
      url: `/api/drives/${driveKey}/refresh`,
    })

    expect(refreshResponse.statusCode).toBe(200)

    const refreshedTree = (refreshResponse.json() as {
      data: {
        children?: Array<{
          path: string
          children?: Array<{ path: string }>
        }>
      }
    }).data

    expect(refreshedTree.children?.[0]).toEqual(expect.objectContaining({
      path: `/${path.basename(sourceDir)}`,
      localDirPath: path.dirname(sourceDir),
      children: expect.arrayContaining([
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/first.mp4`,
          localDirPath: sourceDir,
        }),
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/second.mp4`,
          localDirPath: sourceDir,
        }),
      ]),
    }))

    await fs.rm(path.join(sourceDir, 'first.mp4'))

    const prunedTreeResponse = await bundle.app.inject({
      method: 'POST',
      url: `/api/drives/${driveKey}/refresh`,
    })

    expect(prunedTreeResponse.statusCode).toBe(200)
    const prunedTree = (prunedTreeResponse.json() as {
      data: {
        children?: Array<{
          path: string
          children?: Array<{ path: string }>
        }>
      }
    }).data

    expect(prunedTree.children?.[0]).toEqual(expect.objectContaining({
      path: `/${path.basename(sourceDir)}`,
      children: [
        expect.objectContaining({
          path: `/${path.basename(sourceDir)}/second.mp4`,
        }),
      ],
    }))
  }, 20_000)

  it('treats repeated delete on the same drive as success', async () => {
    const { bundle } = await createAppBundle('cinereel-drive-delete-repeat-')

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
