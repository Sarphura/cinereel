import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

type AppBundle = Awaited<ReturnType<typeof import('../../app')['createApp']>>

const activeBundles: AppBundle[] = []
const activeDirs: string[] = []
const execFileAsync = promisify(execFile)

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

describe('preview controller', () => {
  it('serves mounted local files for preview without requiring a download record', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-preview-local-store-'))
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-preview-local-source-'))
    activeDirs.push(storeDir, sourceDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    await fs.writeFile(path.join(sourceDir, 'cover.jpg'), 'local-jpeg')

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: { name: '本地发布' },
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

    const previewResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${driveKey}/preview`,
      query: {
        resourcePath: `/${path.basename(sourceDir)}/cover.jpg`,
      },
    })

    expect(previewResponse.statusCode).toBe(200)
    expect(previewResponse.headers['content-type']).toContain('image/jpeg')
    expect(previewResponse.body).toBe('local-jpeg')
  }, 20_000)

  it('serves downloaded image and media files for preview', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-preview-store-'))
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-preview-target-'))
    activeDirs.push(storeDir, targetDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    await bundle.hyper.drive.put('/posters/cover.jpg', Buffer.from('jpeg-data'))
    await bundle.hyper.drive.put('/movies/trailer.mp4', Buffer.from('video-data'))

    const waitForJob = async (jobId: string) => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const response = await bundle.app.inject({
          method: 'GET',
          url: `/api/downloads/${jobId}`,
        })

        const job = (response.json() as {
          data: { status: 'queued' | 'downloading' | 'completed' | 'failed' }
        }).data

        if (job.status === 'completed' || job.status === 'failed') {
          return job.status
        }

        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      return 'queued'
    }

    const imageDownload = await bundle.app.inject({
      method: 'POST',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/posters/cover.jpg',
        targetDir,
      },
    })

    expect(imageDownload.statusCode).toBe(200)
    expect(await waitForJob((imageDownload.json() as { data: { id: string } }).data.id)).toBe('completed')

    const videoDownload = await bundle.app.inject({
      method: 'POST',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/movies/trailer.mp4',
        targetDir,
      },
    })

    expect(videoDownload.statusCode).toBe(200)
    expect(await waitForJob((videoDownload.json() as { data: { id: string } }).data.id)).toBe('completed')

    const imagePreview = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/preview`,
      query: {
        resourcePath: '/posters/cover.jpg',
      },
    })

    expect(imagePreview.statusCode).toBe(200)
    expect(imagePreview.headers['content-type']).toContain('image/jpeg')
    expect(imagePreview.body).toBe('jpeg-data')

    const initialVideoPreview = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/preview`,
      query: {
        resourcePath: '/movies/trailer.mp4',
      },
    })

    expect(initialVideoPreview.statusCode).toBe(200)
    expect(initialVideoPreview.headers['content-type']).toContain('video/mp4')
    expect(initialVideoPreview.headers['content-length']).toBe('10')
    expect(initialVideoPreview.body).toBe('video-data')

    const videoPreview = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/preview`,
      query: {
        resourcePath: '/movies/trailer.mp4',
      },
      headers: {
        range: 'bytes=0-4',
      },
    })

    expect(videoPreview.statusCode).toBe(206)
    expect(videoPreview.headers['content-type']).toContain('video/mp4')
    expect(videoPreview.headers['content-range']).toBe('bytes 0-4/10')
    expect(videoPreview.body).toBe('video')
  }, 20_000)

  it('rejects preview for files that have not been downloaded', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-preview-missing-store-'))
    activeDirs.push(storeDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    await bundle.hyper.drive.put('/docs/readme.pdf', Buffer.from('pdf-data'))

    const response = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/preview`,
      query: {
        resourcePath: '/docs/readme.pdf',
      },
    })

    expect(response.statusCode).toBe(404)
  }, 20_000)

  it('transcodes mkv previews into a browser-playable mp4 stream', async () => {
    const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-preview-mkv-store-'))
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-preview-mkv-target-'))
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinereel-preview-mkv-source-'))
    activeDirs.push(storeDir, targetDir, sourceDir)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const mkvPath = path.join(sourceDir, 'sample.mkv')
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=size=16x16:rate=1',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=mono',
      '-t', '1',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      mkvPath,
    ])

    const { createApp } = await import('../../app')
    const bundle = await createApp()
    activeBundles.push(bundle)

    const mkvBuffer = await fs.readFile(mkvPath)
    await bundle.hyper.drive.put('/movies/sample.mkv', mkvBuffer)

    const downloadResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/downloads',
      payload: {
        driveKey: bundle.hyper.driveKey,
        resourcePath: '/movies/sample.mkv',
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

      const job = (statusResponse.json() as {
        data: { status: 'queued' | 'downloading' | 'completed' | 'failed' }
      }).data

      if (job.status === 'completed') {
        break
      }

      expect(job.status).not.toBe('failed')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const previewHeadResponse = await bundle.app.inject({
      method: 'HEAD',
      url: `/api/drives/${bundle.hyper.driveKey}/preview`,
      query: {
        resourcePath: '/movies/sample.mkv',
      },
    })

    expect(previewHeadResponse.statusCode).toBe(200)
    expect(previewHeadResponse.headers['content-type']).toContain('video/mp4')

    const previewResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/preview`,
      query: {
        resourcePath: '/movies/sample.mkv',
      },
    })

    expect(previewResponse.statusCode).toBe(200)
    expect(previewResponse.headers['content-type']).toContain('video/mp4')
    expect(previewResponse.body.length).toBeGreaterThan(0)

    const rangePreviewResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/drives/${bundle.hyper.driveKey}/preview`,
      query: {
        resourcePath: '/movies/sample.mkv',
      },
      headers: {
        range: 'bytes=0-127',
      },
    })

    expect(rangePreviewResponse.statusCode).toBe(200)
    expect(rangePreviewResponse.headers['content-type']).toContain('video/mp4')
    expect(rangePreviewResponse.body.length).toBeGreaterThan(0)
  }, 30_000)
})
