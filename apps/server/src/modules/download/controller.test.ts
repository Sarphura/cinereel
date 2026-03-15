import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type AppBundle = Awaited<ReturnType<typeof import('../../app')['createApp']>>

const activeBundles: AppBundle[] = []
const activeDirs: string[] = []

afterEach(async () => {
  while (activeBundles.length) {
    const bundle = activeBundles.pop()

    if (!bundle) {
      continue
    }

    await bundle.hyper.close()
    await bundle.app.close()
  }

  while (activeDirs.length) {
    const dir = activeDirs.pop()

    if (!dir) {
      continue
    }

    await fs.rm(dir, { recursive: true, force: true })
  }

  delete process.env.CORESTORE_DIR
  delete process.env.PORT
  vi.resetModules()
})

describe('download controller', () => {
  it('downloads a subscribed collection into the chosen directory', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-store-'))
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-target-'))
    activeDirs.push(storeDir, targetDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    await bundle.hyper.drive.put('/movies/feature.mp4', Buffer.from('movie-data'))
    await bundle.hyper.drive.put('/posters/cover.jpg', Buffer.from('cover-data'))
    await bundle.hyper.drive.put('/.cinereel/publications.json', Buffer.from('{}'))

    const response = await bundle.app.inject({
      method: 'POST',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/',
        targetDir,
        targetName: '我的订阅集合',
      },
    })

    expect(response.statusCode).toBe(200)

    const jobId = (response.json() as { data: { id: string } }).data.id

    const listResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/downloads',
    })

    expect(listResponse.statusCode).toBe(200)
    expect((listResponse.json() as {
      data: Array<{
        id: string
        fileName: string
        status: 'queued' | 'downloading' | 'completed' | 'failed'
      }>
    }).data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: jobId,
        fileName: '我的订阅集合',
      }),
    ]))

    let lastJob: {
      status: 'queued' | 'downloading' | 'completed' | 'failed'
      error: string | null
      targetPath: string
      totalFiles: number
      downloadedFiles: number
    } | null = null

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const statusResponse = await bundle.app.inject({
        method: 'GET',
        url: `/api/downloads/${jobId}`,
      })

      expect(statusResponse.statusCode).toBe(200)
      lastJob = (statusResponse.json() as { data: typeof lastJob }).data

      if (lastJob?.status === 'completed' || lastJob?.status === 'failed') {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    expect(lastJob).not.toBeNull()
    expect(lastJob?.status).toBe('completed')
    expect(lastJob?.error).toBeNull()
    expect(lastJob?.totalFiles).toBe(2)
    expect(lastJob?.downloadedFiles).toBe(2)

    const basePath = path.join(targetDir, '我的订阅集合')
    expect(await fs.readFile(path.join(basePath, 'movies/feature.mp4'), 'utf8')).toBe('movie-data')
    expect(await fs.readFile(path.join(basePath, 'posters/cover.jpg'), 'utf8')).toBe('cover-data')
    await expect(fs.stat(path.join(basePath, '.cinereel/publications.json'))).rejects.toThrow()

    const subscribeResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey: bundle.hyper.driveKey,
        name: '本地镜像',
      },
    })

    expect(subscribeResponse.statusCode).toBe(200)

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/tree`,
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
    }).data.children?.find((node) => node.path === '/movies')).toMatchObject({
      path: '/movies',
      localDirPath: path.join(basePath, 'movies'),
      children: [
        expect.objectContaining({
          path: '/movies/feature.mp4',
          localDirPath: path.join(basePath, 'movies'),
        }),
      ],
    })
  }, 20_000)

  it('downloads only the remaining files when a directory already contains individually downloaded files', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-incremental-store-'))
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-incremental-target-'))
    activeDirs.push(storeDir, targetDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    await bundle.hyper.drive.put('/movies/feature.mp4', Buffer.from('movie-data'))
    await bundle.hyper.drive.put('/movies/trailer.mp4', Buffer.from('trailer-data'))

    const waitForJob = async (jobId: string) => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const statusResponse = await bundle.app.inject({
          method: 'GET',
          url: `/api/downloads/${jobId}`,
        })

        expect(statusResponse.statusCode).toBe(200)
        const job = (statusResponse.json() as {
          data: {
            status: 'queued' | 'downloading' | 'completed' | 'failed'
            totalFiles: number
            downloadedFiles: number
            error: string | null
          }
        }).data

        if (job.status === 'completed' || job.status === 'failed') {
          return job
        }

        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      throw new Error('下载任务超时。')
    }

    const singleFileDownload = await bundle.app.inject({
      method: 'POST',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/movies/feature.mp4',
        targetDir,
      },
    })

    expect(singleFileDownload.statusCode).toBe(200)
    expect(await waitForJob((singleFileDownload.json() as { data: { id: string } }).data.id)).toMatchObject({
      status: 'completed',
      totalFiles: 1,
      downloadedFiles: 1,
      error: null,
    })

    const directoryDownload = await bundle.app.inject({
      method: 'POST',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/movies',
        targetDir,
        targetName: 'movies',
      },
    })

    expect(directoryDownload.statusCode).toBe(200)

    expect(await waitForJob((directoryDownload.json() as { data: { id: string } }).data.id)).toMatchObject({
      status: 'completed',
      totalFiles: 1,
      downloadedFiles: 1,
      error: null,
    })

    expect(await fs.readFile(path.join(targetDir, 'movies/feature.mp4'), 'utf8')).toBe('movie-data')
    expect(await fs.readFile(path.join(targetDir, 'movies/trailer.mp4'), 'utf8')).toBe('trailer-data')

    const subscribeResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey: bundle.hyper.driveKey,
        name: '增量下载测试',
      },
    })

    expect(subscribeResponse.statusCode).toBe(200)

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/tree`,
    })

    expect(treeResponse.statusCode).toBe(200)
    expect((treeResponse.json() as {
      data: {
        children?: Array<{
          path: string
          children?: Array<{
            path: string
            localDirPath?: string | null
          }>
        }>
      }
    }).data.children?.find((node) => node.path === '/movies')?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/movies/feature.mp4',
          localDirPath: path.join(targetDir, 'movies'),
        }),
        expect.objectContaining({
          path: '/movies/trailer.mp4',
          localDirPath: path.join(targetDir, 'movies'),
        }),
      ]),
    )
  }, 20_000)

  it('marks a directory as downloaded once all nested files have been downloaded individually', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-dir-infer-store-'))
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-dir-infer-target-'))
    activeDirs.push(storeDir, targetDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    await bundle.hyper.drive.put('/movies/feature.mp4', Buffer.from('movie-data'))
    await bundle.hyper.drive.put('/movies/trailer.mp4', Buffer.from('trailer-data'))

    const waitForJob = async (jobId: string) => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const statusResponse = await bundle.app.inject({
          method: 'GET',
          url: `/api/downloads/${jobId}`,
        })

        expect(statusResponse.statusCode).toBe(200)
        const job = (statusResponse.json() as {
          data: {
            status: 'queued' | 'downloading' | 'completed' | 'failed'
          }
        }).data

        if (job.status === 'completed' || job.status === 'failed') {
          return job
        }

        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      throw new Error('下载任务超时。')
    }

    for (const resourcePath of ['/movies/feature.mp4', '/movies/trailer.mp4']) {
      const downloadResponse = await bundle.app.inject({
        method: 'POST',
        url: '/api/downloads',
        payload: {
          driveKey: bundle.hyper.driveKey,
          resourcePath,
          targetDir,
        },
      })

      expect(downloadResponse.statusCode).toBe(200)
      expect(await waitForJob((downloadResponse.json() as { data: { id: string } }).data.id)).toMatchObject({
        status: 'completed',
      })
    }

    const subscribeResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey: bundle.hyper.driveKey,
        name: '目录推导测试',
      },
    })

    expect(subscribeResponse.statusCode).toBe(200)

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/tree`,
    })

    expect(treeResponse.statusCode).toBe(200)
    expect((treeResponse.json() as {
      data: {
        children?: Array<{
          path: string
          localDirPath?: string | null
        }>
      }
    }).data.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/movies',
          localDirPath: path.join(targetDir, 'movies'),
        }),
      ]),
    )
  }, 20_000)

  it('falls back to undownloaded state after a downloaded local file is removed', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-missing-store-'))
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-missing-target-'))
    activeDirs.push(storeDir, targetDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    await bundle.hyper.drive.put('/movies/feature.mp4', Buffer.from('movie-data'))

    const downloadResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/movies/feature.mp4',
        targetDir,
      },
    })

    expect(downloadResponse.statusCode).toBe(200)
    const jobId = (downloadResponse.json() as { data: { id: string } }).data.id

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const statusResponse = await bundle.app.inject({
        method: 'GET',
        url: `/api/downloads/${jobId}`,
      })

      expect(statusResponse.statusCode).toBe(200)
      const job = (statusResponse.json() as {
        data: {
          status: 'queued' | 'downloading' | 'completed' | 'failed'
        }
      }).data

      if (job.status === 'completed') {
        break
      }

      if (job.status === 'failed') {
        throw new Error('下载任务失败。')
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    await fs.rm(path.join(targetDir, 'movies/feature.mp4'))

    const subscribeResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey: bundle.hyper.driveKey,
        name: '丢失文件测试',
      },
    })

    expect(subscribeResponse.statusCode).toBe(200)

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/tree`,
    })

    expect(treeResponse.statusCode).toBe(200)
    expect((treeResponse.json() as {
      data: {
        children?: Array<{
          path: string
          children?: Array<{
            path: string
            localDirPath?: string | null
          }>
        }>
      }
    }).data.children?.find((node) => node.path === '/movies')?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/movies/feature.mp4',
          localDirPath: null,
        }),
      ]),
    )
  }, 20_000)

  it('removes local downloaded files and resets tree state through the download delete api', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-remove-store-'))
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-download-remove-target-'))
    activeDirs.push(storeDir, targetDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    await bundle.hyper.drive.put('/movies/feature.mp4', Buffer.from('movie-data'))

    const downloadResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/movies/feature.mp4',
        targetDir,
      },
    })

    expect(downloadResponse.statusCode).toBe(200)
    const jobId = (downloadResponse.json() as { data: { id: string } }).data.id

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const statusResponse = await bundle.app.inject({
        method: 'GET',
        url: `/api/downloads/${jobId}`,
      })

      expect(statusResponse.statusCode).toBe(200)
      const job = (statusResponse.json() as {
        data: {
          status: 'queued' | 'downloading' | 'completed' | 'failed'
        }
      }).data

      if (job.status === 'completed') {
        break
      }

      if (job.status === 'failed') {
        throw new Error('下载任务失败。')
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    expect(await fs.readFile(path.join(targetDir, 'movies/feature.mp4'), 'utf8')).toBe('movie-data')

    const removeResponse = await bundle.app.inject({
      method: 'DELETE',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/movies/feature.mp4',
      },
    })

    expect(removeResponse.statusCode).toBe(200)
    await expect(fs.stat(path.join(targetDir, 'movies/feature.mp4'))).rejects.toThrow()

    const subscribeResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/subscriptions',
      payload: {
        driveKey: bundle.hyper.driveKey,
        name: '移除下载测试',
      },
    })

    expect(subscribeResponse.statusCode).toBe(200)

    const treeResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/tree`,
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
    }).data.children?.find((node) => node.path === '/movies')?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/movies/feature.mp4',
          localDirPath: null,
        }),
      ]),
    )
  }, 20_000)
})
