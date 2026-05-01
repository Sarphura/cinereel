import fs from 'node:fs/promises'
import path from 'node:path'
import type Hyperdrive from 'hyperdrive'
import type { HyperModuleConfig, MountJob, MountResult } from '../../base/hyper/types'
import { readDriveDescriptor } from '../drive/descriptor'
import { buildPublicationRecord, listPublishedResources, upsertPublishedResource } from '../publication/service'
import { openWritableDrive } from '../drive/service'
import { createScanJob } from '../scan/service'

interface MountProgressSnapshot {
  totalFiles: number
  processedFiles: number
  totalBytes: number
  processedBytes: number
  currentFilePath: string | null
  progress: number
}

interface LocalPathScanResult {
  resolvedTargetPath: string
  kind: 'file' | 'directory'
  totalFiles: number
  totalBytes: number
}

const mountJobs = new Map<string, MountJob>()

export async function createMountJob(
  hyper: HyperModuleConfig,
  driveKey: string,
  targetPath: string,
) {
  const scan = await scanLocalPath(targetPath)
  const now = Date.now()
  const job: MountJob = {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    driveKey: driveKey.trim().toLowerCase(),
    targetPath: scan.resolvedTargetPath,
    mountedPath: null,
    kind: scan.kind,
    totalFiles: scan.totalFiles,
    processedFiles: 0,
    totalBytes: scan.totalBytes,
    processedBytes: 0,
    currentFilePath: null,
    progress: 0,
    status: 'queued',
    error: null,
    result: null,
    createdAt: now,
    updatedAt: now,
  }

  mountJobs.set(job.id, job)
  void runMountJob(hyper, job.id)

  return job
}

export function getMountJob(jobId: string) {
  return mountJobs.get(jobId) ?? null
}

export function listMountJobs() {
  return Array.from(mountJobs.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function mountLocalPath(
  drive: Hyperdrive,
  targetPath: string,
): Promise<MountResult> {
  return syncLocalPathToDrive(drive, targetPath)
}

export async function syncPublishedResourcesFromLocal(drive: Hyperdrive) {
  const publications = await listPublishedResources(drive)

  for (const publication of publications) {
    if (!publication.sourcePath) {
      continue
    }

    try {
      await syncLocalPathToDrive(drive, publication.sourcePath)
    } catch {
      // Keep the last published snapshot when the original local path is unavailable.
    }
  }
}

async function syncLocalPathToDrive(
  drive: Hyperdrive,
  targetPath: string,
  options?: {
    onProgress?: (snapshot: MountProgressSnapshot) => void
    prune?: boolean
  },
): Promise<MountResult> {
  const scan = await scanLocalPath(targetPath)
  const { resolvedTargetPath, kind, totalFiles, totalBytes } = scan
  const rootName = path.basename(resolvedTargetPath)
  const prefix = `/${rootName}`

  options?.onProgress?.({
    totalFiles,
    processedFiles: 0,
    totalBytes,
    processedBytes: 0,
    currentFilePath: null,
    progress: totalFiles > 0 ? 0 : 1,
  })

  const publication = await upsertPublishedResource(
    drive,
    buildPublicationRecord({
      mountedPath: prefix,
      kind,
      sourcePath: resolvedTargetPath,
      fileCount: totalFiles,
      totalSize: totalBytes,
    }),
  )

  options?.onProgress?.({
    totalFiles,
    processedFiles: totalFiles,
    totalBytes,
    processedBytes: totalBytes,
    currentFilePath: null,
    progress: 1,
  })

  return {
    sourcePath: resolvedTargetPath,
    mountedPath: prefix,
    kind,
    filesDiscovered: totalFiles,
    filesAdded: totalFiles,
    filesChanged: 0,
    filesRemoved: 0,
    bytesAdded: 0,
    bytesRemoved: 0,
    operations: [],
    publication,
  }
}

async function runMountJob(hyper: HyperModuleConfig, jobId: string) {
  const currentJob = getMountJob(jobId)

  if (!currentJob) {
    return
  }

  updateMountJob(jobId, {
    status: 'mounting',
    error: null,
  })

  const { driveKey, targetPath } = currentJob

  try {
    const { drive, close } = await openWritableDrive(hyper, driveKey)

    try {
      const result = await syncLocalPathToDrive(drive, targetPath, {
        onProgress: (snapshot) => {
          updateMountJob(jobId, {
            totalFiles: snapshot.totalFiles,
            processedFiles: snapshot.processedFiles,
            totalBytes: snapshot.totalBytes,
            processedBytes: snapshot.processedBytes,
            currentFilePath: snapshot.currentFilePath,
            progress: snapshot.progress,
          })
        },
      })

      updateMountJob(jobId, {
        mountedPath: result.mountedPath,
        kind: result.kind,
        currentFilePath: null,
        processedFiles: currentJob.totalFiles,
        processedBytes: currentJob.totalBytes,
        progress: 1,
        status: 'completed',
        result,
      })

      const descriptor = await readDriveDescriptor(drive)

      if (
        descriptor?.kind === 'collection'
        && (descriptor.type === 'movie' || descriptor.type === 'series')
      ) {
        await createScanJob(hyper, {
          driveKey,
          rootPath: result.mountedPath,
          publicationId: result.publication.id,
          sourcePath: result.sourcePath,
          sourceKind: result.kind,
        })
      }
    } finally {
      await close()
    }
  } catch (error) {
    updateMountJob(jobId, {
      currentFilePath: null,
      status: 'failed',
      error: error instanceof Error ? error.message : '挂载失败。',
    })
  }
}

function updateMountJob(jobId: string, patch: Partial<MountJob>) {
  const current = mountJobs.get(jobId)

  if (!current) {
    return
  }

  mountJobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  })
}

async function scanLocalPath(targetPath: string): Promise<LocalPathScanResult> {
  const resolvedTargetPath = path.resolve(targetPath)
  const stats = await fs.stat(resolvedTargetPath)

  if (stats.isFile()) {
    return {
      resolvedTargetPath,
      kind: 'file',
      totalFiles: 1,
      totalBytes: stats.size,
    }
  }

  if (!stats.isDirectory()) {
    throw new Error('仅支持挂载文件或目录。')
  }

  const totals = await collectLocalEntries(resolvedTargetPath)

  return {
    resolvedTargetPath,
    kind: 'directory',
    totalFiles: totals.totalFiles,
    totalBytes: totals.totalBytes,
  }
}

async function collectLocalEntries(directoryPath: string) {
  let totalFiles = 0
  let totalBytes = 0
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }

    const entryPath = path.join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      const nested = await collectLocalEntries(entryPath)
      totalFiles += nested.totalFiles
      totalBytes += nested.totalBytes
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const stats = await fs.stat(entryPath)
    totalFiles += 1
    totalBytes += stats.size
  }

  return {
    totalFiles,
    totalBytes,
  }
}
