import fs from 'node:fs/promises'
import path from 'node:path'
import type Hyperdrive from 'hyperdrive'
import type {
  HyperModuleConfig,
  ScanFailedFileRecord,
  ScanJob,
} from '../../infra/hyper/types'
import { openWritableDrive } from '../drive/service'
import { deletePublishedResource } from '../publication/service'
import { probeMediaFile } from './ffprobe'
import {
  replaceMediaIndexEntries,
  removeMediaIndexEntriesByRootPath,
  upsertScanRootStatus,
} from './store'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.ts', '.m2ts'])

interface ScanJobContext {
  sourcePath: string
  sourceKind: 'file' | 'directory'
}

type InternalScanJob = ScanJob & ScanJobContext

const scanJobs = new Map<string, InternalScanJob>()

export async function createScanJob(
  hyper: HyperModuleConfig,
  input: {
    driveKey: string
    rootPath: string
    publicationId: string
    sourcePath: string
    sourceKind: 'file' | 'directory'
  },
) {
  const entries = await collectScanEntries(input.sourcePath, input.sourceKind, input.rootPath)
  const now = Date.now()
  const job: InternalScanJob = {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    driveKey: input.driveKey.trim().toLowerCase(),
    rootPath: input.rootPath,
    publicationId: input.publicationId,
    sourcePath: input.sourcePath,
    sourceKind: input.sourceKind,
    totalFiles: entries.length,
    processedFiles: 0,
    currentFilePath: null,
    progress: entries.length > 0 ? 0 : 1,
    status: 'queued',
    error: null,
    failedFiles: [],
    createdAt: now,
    updatedAt: now,
  }

  scanJobs.set(job.id, job)
  hyper.log.info({
    scanJobId: job.id,
    driveKey: job.driveKey,
    rootPath: job.rootPath,
    totalFiles: job.totalFiles,
  }, 'FFprobe scan job created')
  void runScanJob(hyper, job.id, entries)
  return toPublicScanJob(job)
}

export function getScanJob(jobId: string) {
  const job = scanJobs.get(jobId)
  return job ? toPublicScanJob(job) : null
}

export function listScanJobs() {
  return Array.from(scanJobs.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(toPublicScanJob)
}

export async function rollbackPublishedRoot(
  drive: Hyperdrive,
  publicationId: string,
  rootPath: string,
) {
  await deletePublishedResource(drive, publicationId)
  await removeMediaIndexEntriesByRootPath(drive, rootPath)
}

async function runScanJob(
  hyper: HyperModuleConfig,
  jobId: string,
  entries: Array<{ localPath: string; resourcePath: string }>,
) {
  const startedAt = Date.now()
  updateScanJob(jobId, {
    status: 'scanning',
    error: null,
  })

  const currentJob = scanJobs.get(jobId)

  if (!currentJob) {
    return
  }

  hyper.log.info({
    scanJobId: currentJob.id,
    driveKey: currentJob.driveKey,
    rootPath: currentJob.rootPath,
  }, 'FFprobe scan job started')

  const successfulEntries = []
  const failedFiles: ScanFailedFileRecord[] = []

  try {
    for (const entry of entries) {
      updateScanJob(jobId, {
        currentFilePath: entry.resourcePath,
      })

      try {
        const metadata = await probeMediaFile(entry.localPath, entry.resourcePath)
        successfulEntries.push(metadata)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ffprobe 扫描失败。'
        const failedRecord: ScanFailedFileRecord = {
          path: entry.resourcePath,
          fileName: path.basename(entry.resourcePath),
          error: message,
          failedAt: Date.now(),
        }
        failedFiles.push(failedRecord)
        hyper.log.error({
          scanJobId: currentJob.id,
          driveKey: currentJob.driveKey,
          rootPath: currentJob.rootPath,
          resourcePath: entry.resourcePath,
          error: message,
        }, 'FFprobe scan failed for file')
      } finally {
        const snapshot = scanJobs.get(jobId)
        updateScanJob(jobId, {
          processedFiles: Math.min((snapshot?.processedFiles ?? 0) + 1, entries.length),
          progress: entries.length > 0 ? Math.min(((snapshot?.processedFiles ?? 0) + 1) / entries.length, 1) : 1,
          failedFiles,
        })
      }
    }

    const { drive, close } = await openWritableDrive(hyper, currentJob.driveKey)

    try {
      if (failedFiles.length > 0) {
        await upsertScanRootStatus(drive, {
          rootPath: currentJob.rootPath,
          status: 'failed',
          failedFiles,
          updatedAt: Date.now(),
        })
        hyper.log.warn({
          scanJobId: currentJob.id,
          driveKey: currentJob.driveKey,
          rootPath: currentJob.rootPath,
          failedFiles: failedFiles.length,
        }, 'FFprobe scan rollback started')
        await rollbackPublishedRoot(drive, currentJob.publicationId, currentJob.rootPath)
        hyper.log.warn({
          scanJobId: currentJob.id,
          driveKey: currentJob.driveKey,
          rootPath: currentJob.rootPath,
        }, 'FFprobe scan rollback completed')
        const message = failedFiles[0]?.error ?? 'FFprobe 扫描失败。'
        updateScanJob(jobId, {
          currentFilePath: null,
          status: 'failed',
          error: message,
          failedFiles,
          progress: 1,
        })
        hyper.log.error({
          scanJobId: currentJob.id,
          driveKey: currentJob.driveKey,
          rootPath: currentJob.rootPath,
          totalFiles: entries.length,
          failedFiles: failedFiles.length,
          durationMs: Date.now() - startedAt,
        }, 'FFprobe scan job failed')
        return
      }

      await replaceMediaIndexEntries(drive, currentJob.rootPath, successfulEntries)
      await upsertScanRootStatus(drive, {
        rootPath: currentJob.rootPath,
        status: 'completed',
        failedFiles: [],
        updatedAt: Date.now(),
      })
    } finally {
      await close()
    }

    updateScanJob(jobId, {
      currentFilePath: null,
      status: 'completed',
      error: null,
      failedFiles: [],
      progress: 1,
    })
    hyper.log.info({
      scanJobId: currentJob.id,
      driveKey: currentJob.driveKey,
      rootPath: currentJob.rootPath,
      totalFiles: entries.length,
      successFiles: successfulEntries.length,
      failedFiles: 0,
      durationMs: Date.now() - startedAt,
    }, 'FFprobe scan job completed')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FFprobe 扫描失败。'
    updateScanJob(jobId, {
      currentFilePath: null,
      status: 'failed',
      error: message,
      failedFiles,
      progress: 1,
    })
    hyper.log.error({
      scanJobId: currentJob.id,
      driveKey: currentJob.driveKey,
      rootPath: currentJob.rootPath,
      error: message,
      durationMs: Date.now() - startedAt,
    }, 'FFprobe scan job failed unexpectedly')
  }
}

async function collectScanEntries(
  sourcePath: string,
  sourceKind: 'file' | 'directory',
  rootPath: string,
) {
  if (sourceKind === 'file') {
    return isVideoFile(sourcePath)
      ? [{ localPath: sourcePath, resourcePath: rootPath }]
      : []
  }

  return collectDirectoryScanEntries(sourcePath, rootPath)
}

async function collectDirectoryScanEntries(
  sourcePath: string,
  rootPath: string,
): Promise<Array<{ localPath: string; resourcePath: string }>> {
  const entries = await fs.readdir(sourcePath, { withFileTypes: true })
  const results: Array<{ localPath: string; resourcePath: string }> = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }

    const localPath = path.join(sourcePath, entry.name)
    const resourcePath = path.posix.join(rootPath, entry.name)

    if (entry.isDirectory()) {
      results.push(...await collectDirectoryScanEntries(localPath, resourcePath))
      continue
    }

    if (!entry.isFile() || !isVideoFile(localPath)) {
      continue
    }

    results.push({
      localPath,
      resourcePath,
    })
  }

  return results
}

function isVideoFile(filePath: string) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function updateScanJob(
  jobId: string,
  patch: Partial<ScanJob>,
) {
  const current = scanJobs.get(jobId)

  if (!current) {
    return
  }

  scanJobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  })
}

function toPublicScanJob(job: InternalScanJob): ScanJob {
  return {
    id: job.id,
    driveKey: job.driveKey,
    rootPath: job.rootPath,
    publicationId: job.publicationId,
    totalFiles: job.totalFiles,
    processedFiles: job.processedFiles,
    currentFilePath: job.currentFilePath,
    progress: job.progress,
    status: job.status,
    error: job.error,
    failedFiles: job.failedFiles,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}
