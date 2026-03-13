import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { getPeerDrive } from '../remote/service'

export interface DownloadJob {
  id: string
  driveKey: string
  resourcePath: string
  targetDir: string
  targetPath: string
  fileName: string
  totalBytes: number
  downloadedBytes: number
  progress: number
  status: 'queued' | 'downloading' | 'completed' | 'failed'
  error: string | null
  createdAt: number
  updatedAt: number
}

const downloadJobs = new Map<string, DownloadJob>()

export async function createDownloadJob(
  hyper: HyperModuleConfig,
  driveKey: string,
  resourcePath: string,
  targetDir: string,
) {
  const normalizedTargetDir = targetDir.trim()

  if (!normalizedTargetDir) {
    throw new Error('请提供下载目录。')
  }

  if (!resourcePath.startsWith('/')) {
    throw new Error('资源路径格式无效。')
  }

  const relativePath = normalizeRelativeResourcePath(resourcePath)
  const targetPath = path.join(normalizedTargetDir, relativePath)
  const drive = await getPeerDrive(hyper, driveKey)
  const entry = await drive.entry(resourcePath)

  if (!entry?.value.blob) {
    throw new Error('找不到待下载资源，可能尚未同步完成。')
  }

  const now = Date.now()
  const job: DownloadJob = {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    driveKey: driveKey.toLowerCase(),
    resourcePath,
    targetDir: normalizedTargetDir,
    targetPath,
    fileName: path.posix.basename(resourcePath),
    totalBytes: entry.value.blob.byteLength,
    downloadedBytes: 0,
    progress: 0,
    status: 'queued',
    error: null,
    createdAt: now,
    updatedAt: now,
  }

  downloadJobs.set(job.id, job)
  void runDownload(hyper, job)
  return job
}

export function getDownloadJob(jobId: string) {
  return downloadJobs.get(jobId) ?? null
}

async function runDownload(hyper: HyperModuleConfig, job: DownloadJob) {
  const drive = await getPeerDrive(hyper, job.driveKey)

  try {
    updateJob(job.id, {
      status: 'downloading',
      error: null,
    })

    await fsp.mkdir(path.dirname(job.targetPath), { recursive: true })

    const stream = drive.createReadStream(job.resourcePath)
    stream.on('data', (chunk: Buffer | string) => {
      const size = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength
      const current = getDownloadJob(job.id)

      if (!current) {
        return
      }

      const downloadedBytes = Math.min(current.downloadedBytes + size, current.totalBytes)
      updateJob(job.id, {
        downloadedBytes,
        progress: current.totalBytes > 0 ? downloadedBytes / current.totalBytes : 0,
      })
    })

    await pipeline(stream, fs.createWriteStream(job.targetPath))

    updateJob(job.id, {
      downloadedBytes: job.totalBytes,
      progress: 1,
      status: 'completed',
    })
  } catch (error) {
    updateJob(job.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : '下载失败。',
    })
  }
}

function updateJob(jobId: string, patch: Partial<DownloadJob>) {
  const current = downloadJobs.get(jobId)

  if (!current) {
    return
  }

  downloadJobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  })
}

function normalizeRelativeResourcePath(resourcePath: string) {
  const relative = resourcePath.replace(/^\/+/, '')
  const normalized = path.posix.normalize(relative)

  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('资源路径不安全，拒绝写入下载目录。')
  }

  return normalized
}
