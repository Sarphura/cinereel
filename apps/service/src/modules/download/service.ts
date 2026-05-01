import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { HyperModuleConfig } from '../../base/hyper/types'
import { getPeerDrive } from '../remote/service'

interface DownloadEntry {
  sourcePath: string
  targetPath: string
  size: number
}

interface DirectoryEntriesResult {
  entries: DownloadEntry[]
  discoveredFiles: number
}

interface DownloadedResourceRecord {
  driveKey: string
  resourcePath: string
  targetPath: string
  kind?: 'file' | 'directory'
  updatedAt: number
}

const SIDECAR_FILE_NAMES = new Set(['poster.jpg', 'fanart.jpg'])
const SIDECARE_CACHE_DIR_ENV = 'CINEREEL_CACHE_DIR'

export interface DownloadJob {
  id: string
  driveKey: string
  resourcePath: string
  targetDir: string
  targetPath: string
  kind: 'file' | 'directory'
  fileName: string
  totalFiles: number
  downloadedFiles: number
  totalBytes: number
  downloadedBytes: number
  currentFileName: string | null
  progress: number
  status: 'queued' | 'downloading' | 'completed' | 'failed'
  error: string | null
  createdAt: number
  updatedAt: number
}

const downloadJobs = new Map<string, DownloadJob>()
const DOWNLOADED_RESOURCES_FILE = 'downloaded-resources.json'

export async function syncSubscribedDriveCache(
  hyper: HyperModuleConfig,
  driveKey: string,
  type: 'movie' | 'series',
) {
  const drive = await getPeerDrive(hyper, driveKey)
  await drive.update({ wait: false }).catch(() => {})

  const cacheRoot = getSubscribedDriveCacheRoot(type)
  await fsp.mkdir(cacheRoot, { recursive: true })

  for await (const entry of drive.list('/')) {
    if (isInternalPath(entry.key)) {
      continue
    }

    const relativePath = normalizeRelativeResourcePath(entry.key)
    const targetPath = path.join(cacheRoot, ...relativePath.split('/'))

    if (!entry.value.blob) {
      await fsp.mkdir(targetPath, { recursive: true })
      await upsertDownloadedResourceRecord(hyper, {
        driveKey,
        resourcePath: normalizeNodePath(entry.key),
        targetPath,
        kind: 'directory',
      })
      continue
    }

    if (!isSidecarFile(entry.key)) {
      continue
    }

    const size = entry.value.blob.byteLength
    const cacheEntry = {
      sourcePath: normalizeNodePath(entry.key),
      targetPath,
      size,
    }

    await fsp.mkdir(path.dirname(targetPath), { recursive: true })

    if (!(await shouldSkipDirectoryEntry(cacheEntry))) {
      await pipeline(drive.createReadStream(cacheEntry.sourcePath), fs.createWriteStream(targetPath))
    }

    await upsertDownloadedDirectoryAncestors(hyper, driveKey, cacheEntry.sourcePath, targetPath)
    await upsertDownloadedResourceRecord(hyper, {
      driveKey,
      resourcePath: cacheEntry.sourcePath,
      targetPath,
      kind: 'file',
    })
  }
}

export async function createDownloadJob(
  hyper: HyperModuleConfig,
  driveKey: string,
  resourcePath: string,
  targetDir: string,
  targetName?: string,
) {
  const normalizedTargetDir = targetDir.trim()

  if (!normalizedTargetDir) {
    throw new Error('请提供下载目录。')
  }

  if (!resourcePath.startsWith('/')) {
    throw new Error('资源路径格式无效。')
  }

  const drive = await getPeerDrive(hyper, driveKey)
  const { kind, targetPath, fileName, entries, totalBytes } = await resolveDownloadEntries({
    hyper,
    drive,
    driveKey,
    resourcePath,
    normalizedTargetDir,
    targetName,
  })

  const now = Date.now()
  const job: DownloadJob = {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    driveKey: driveKey.toLowerCase(),
    resourcePath,
    targetDir: normalizedTargetDir,
    targetPath,
    kind,
    fileName,
    totalFiles: entries.length,
    downloadedFiles: 0,
    totalBytes,
    downloadedBytes: 0,
    currentFileName: null,
    progress: 0,
    status: 'queued',
    error: null,
    createdAt: now,
    updatedAt: now,
  }

  downloadJobs.set(job.id, job)

  if (!entries.length) {
    updateJob(job.id, {
      downloadedBytes: totalBytes,
      downloadedFiles: 0,
      progress: 1,
      status: 'completed',
      error: null,
    })
    await markDirectoryAsDownloaded(hyper, job)
    return job
  }

  void runDownload(hyper, job, entries)
  return job
}

export function getDownloadJob(jobId: string) {
  return downloadJobs.get(jobId) ?? null
}

export function listDownloadJobs() {
  return Array.from(downloadJobs.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function getDownloadedResourceDirectoryMap(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const normalizedKey = driveKey.trim().toLowerCase()
  const records = await readDownloadedResourceRecords(hyper, { pruneMissingTargets: true })
  const mapping = new Map<string, string>()

  for (const record of records) {
    if (record.driveKey !== normalizedKey) {
      continue
    }

    mapping.set(
      record.resourcePath,
      record.targetPath,
    )
  }

  return mapping
}

export async function listDownloadedResourceRecordsForDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const normalizedKey = driveKey.trim().toLowerCase()
  const records = await readDownloadedResourceRecords(hyper, { pruneMissingTargets: true })

  return records.filter((record) => record.driveKey === normalizedKey)
}

export async function getDownloadedResourceTargetPath(
  hyper: HyperModuleConfig,
  driveKey: string,
  resourcePath: string,
) {
  const normalizedKey = driveKey.trim().toLowerCase()
  const records = await readDownloadedResourceRecords(hyper, { pruneMissingTargets: true })
  const matchedRecord = records.find((record) => (
    record.driveKey === normalizedKey && record.resourcePath === resourcePath
  ))

  return matchedRecord?.targetPath ?? null
}

export async function removeDownloadedResource(
  hyper: HyperModuleConfig,
  driveKey: string,
  resourcePath: string,
) {
  const normalizedKey = driveKey.trim().toLowerCase()

  if (!resourcePath.startsWith('/')) {
    throw new Error('资源路径格式无效。')
  }

  const records = await readDownloadedResourceRecords(hyper)
  const exactRecord = records.find((record) => (
    record.driveKey === normalizedKey && record.resourcePath === resourcePath
  ))

  if (!exactRecord) {
    throw new Error('找不到对应的下载资源。')
  }

  const descendantPrefix = resourcePath === '/' ? '/' : `${resourcePath.replace(/\/+$/, '')}/`
  const recordsToRemove = records.filter((record) => {
    if (record.driveKey !== normalizedKey) {
      return false
    }

    if (record.resourcePath === resourcePath) {
      return true
    }

    if (exactRecord.kind === 'directory' && record.resourcePath.startsWith(descendantPrefix)) {
      return true
    }

    return false
  })

  if (exactRecord.kind === 'file') {
    const ancestorDirectoryRecords = records.filter((record) => (
      record.driveKey === normalizedKey
      && record.kind === 'directory'
      && isAncestorResourcePath(record.resourcePath, resourcePath)
    ))

    recordsToRemove.push(...ancestorDirectoryRecords)
  }

  const uniqueRecordsToRemove = Array.from(new Map(
    recordsToRemove.map((record) => [`${record.driveKey}:${record.resourcePath}`, record] as const),
  ).values())

  if (exactRecord.kind === 'directory') {
    await fsp.rm(exactRecord.targetPath, { recursive: true, force: true })
  } else {
    await fsp.rm(exactRecord.targetPath, { force: true })
    await removeEmptyParentDirectories(path.dirname(exactRecord.targetPath))
  }

  const remainingRecords = records.filter((record) => !uniqueRecordsToRemove.some((removedRecord) => (
    removedRecord.driveKey === record.driveKey && removedRecord.resourcePath === record.resourcePath
  )))

  await writeDownloadedResourceRecords(hyper, remainingRecords)
}

async function runDownload(hyper: HyperModuleConfig, job: DownloadJob, entries: DownloadEntry[]) {
  try {
    updateJob(job.id, {
      status: 'downloading',
      error: null,
    })

    const drive = await getPeerDrive(hyper, job.driveKey)

    for (const entry of entries) {
      updateJob(job.id, {
        currentFileName: path.basename(entry.targetPath),
      })

      await fsp.mkdir(path.dirname(entry.targetPath), { recursive: true })

      const stream = drive.createReadStream(entry.sourcePath)
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

      await pipeline(stream, fs.createWriteStream(entry.targetPath))
      await upsertDownloadedResourceRecord(hyper, {
        driveKey: job.driveKey,
        resourcePath: entry.sourcePath,
        targetPath: entry.targetPath,
        kind: 'file',
      })

      const current = getDownloadJob(job.id)
      const downloadedFiles = current ? Math.min(current.downloadedFiles + 1, current.totalFiles) : 0
      updateJob(job.id, {
        downloadedFiles,
      })
    }

    updateJob(job.id, {
      downloadedBytes: job.totalBytes,
      downloadedFiles: job.totalFiles,
      currentFileName: null,
      progress: 1,
      status: 'completed',
    })
    await markDirectoryAsDownloaded(hyper, job)
  } catch (error) {
    updateJob(job.id, {
      currentFileName: null,
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

async function readDownloadedResourceRecords(
  hyper: HyperModuleConfig,
  options?: {
    pruneMissingTargets?: boolean
  },
) {
  const filePath = getDownloadedResourcesPath(hyper)

  try {
    const content = await fsp.readFile(filePath, 'utf8')
    const parsed = JSON.parse(content) as DownloadedResourceRecord[]
    const records = Array.isArray(parsed)
      ? parsed.filter((record) => (
        typeof record?.driveKey === 'string'
        && typeof record?.resourcePath === 'string'
        && typeof record?.targetPath === 'string'
        && (record.kind === undefined || record.kind === 'file' || record.kind === 'directory')
        && typeof record?.updatedAt === 'number'
      ))
      : []

    if (!options?.pruneMissingTargets) {
      return records
    }

    const nextRecords = await pruneMissingDownloadedResourceRecords(records)

    if (nextRecords.length !== records.length) {
      await writeDownloadedResourceRecords(hyper, nextRecords)
    }

    return nextRecords
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function pruneMissingDownloadedResourceRecords(records: DownloadedResourceRecord[]) {
  const results = await Promise.all(records.map(async (record) => {
    const targetPath = record.kind === 'directory'
      ? record.targetPath
      : record.targetPath

    try {
      const stats = await fsp.stat(targetPath)

      if (record.kind === 'directory') {
        return stats.isDirectory() ? record : null
      }

      return stats.isFile() ? record : null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }

      throw error
    }
  }))

  return results.filter((record): record is DownloadedResourceRecord => Boolean(record))
}

async function upsertDownloadedResourceRecord(
  hyper: HyperModuleConfig,
  input: {
    driveKey: string
    resourcePath: string
    targetPath: string
    kind?: 'file' | 'directory'
  },
) {
  const records = await readDownloadedResourceRecords(hyper)
  const normalizedKey = input.driveKey.trim().toLowerCase()
  const existing = records.find((record) => (
    record.driveKey === normalizedKey && record.resourcePath === input.resourcePath
  ))

  if (existing) {
    existing.targetPath = input.targetPath
    existing.kind = input.kind ?? 'file'
    existing.updatedAt = Date.now()
  } else {
    records.unshift({
      driveKey: normalizedKey,
      resourcePath: input.resourcePath,
      targetPath: input.targetPath,
      kind: input.kind ?? 'file',
      updatedAt: Date.now(),
    })
  }

  await writeDownloadedResourceRecords(hyper, records)
}

async function upsertDownloadedDirectoryAncestors(
  hyper: HyperModuleConfig,
  driveKey: string,
  resourcePath: string,
  targetPath: string,
) {
  const segments = normalizeNodePath(resourcePath).split('/').filter(Boolean)

  for (let index = 0; index < segments.length - 1; index += 1) {
    const ancestorResourcePath = `/${segments.slice(0, index + 1).join('/')}`
    const ancestorTargetPath = path.join(path.dirname(targetPath), ...segments.slice(index + 1, -1).map(() => '..'))

    await upsertDownloadedResourceRecord(hyper, {
      driveKey,
      resourcePath: ancestorResourcePath,
      targetPath: path.resolve(ancestorTargetPath),
      kind: 'directory',
    })
  }
}

async function writeDownloadedResourceRecords(
  hyper: HyperModuleConfig,
  records: DownloadedResourceRecord[],
) {
  const filePath = getDownloadedResourcesPath(hyper)
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, JSON.stringify(records, null, 2), 'utf8')
}

function getDownloadedResourcesPath(hyper: HyperModuleConfig) {
  return path.join(hyper.storeDir, DOWNLOADED_RESOURCES_FILE)
}

export function getSubscribedDriveBaseCacheDir() {
  return process.env[SIDECARE_CACHE_DIR_ENV]?.trim()
    ? path.resolve(process.env[SIDECARE_CACHE_DIR_ENV]!.trim())
    : path.resolve(process.cwd(), 'cache')
}

function getSubscribedDriveCacheRoot(type: 'movie' | 'series') {
  const baseDir = getSubscribedDriveBaseCacheDir()
  return path.join(baseDir, type === 'movie' ? 'movies' : 'series')
}

async function resolveDownloadEntries(input: {
  hyper: HyperModuleConfig
  drive: Awaited<ReturnType<typeof getPeerDrive>>
  driveKey: string
  resourcePath: string
  normalizedTargetDir: string
  targetName?: string
}) {
  if (input.resourcePath === '/') {
    const directoryName = sanitizeTargetName(input.targetName) || `drive-${input.driveKey.slice(0, 8)}`
    const targetPath = path.join(input.normalizedTargetDir, directoryName)
    const { entries, discoveredFiles } = await collectDirectoryEntries(input.hyper, input.drive, input.driveKey, '/', targetPath)

    if (!discoveredFiles) {
      throw new Error('当前集合没有可下载的文件。')
    }

    return {
      kind: 'directory' as const,
      targetPath,
      fileName: directoryName,
      entries,
      totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    }
  }

  const entry = await input.drive.entry(input.resourcePath)

  if (entry?.value.blob) {
    const targetPath = path.join(
      input.normalizedTargetDir,
      normalizeRelativeResourcePath(input.resourcePath),
    )
    return {
      kind: 'file' as const,
      targetPath,
      fileName: path.posix.basename(input.resourcePath),
      entries: [{
        sourcePath: input.resourcePath,
        targetPath,
        size: entry.value.blob.byteLength,
      }],
      totalBytes: entry.value.blob.byteLength,
    }
  }

  const directoryName = sanitizeTargetName(input.targetName) || path.posix.basename(input.resourcePath)

  if (!directoryName) {
    throw new Error('下载目录名称无效。')
  }

  const targetPath = path.join(input.normalizedTargetDir, directoryName)
  const { entries, discoveredFiles } = await collectDirectoryEntries(
    input.hyper,
    input.drive,
    input.driveKey,
    input.resourcePath,
    targetPath,
  )

  if (!entry && !discoveredFiles) {
    throw new Error('找不到待下载资源，可能尚未同步完成。')
  }

  if (entry && !entry.value.blob && !discoveredFiles) {
    throw new Error('当前集合没有可下载的文件。')
  }

  return {
    kind: 'directory' as const,
    targetPath,
    fileName: directoryName,
    entries,
    totalBytes: entries.reduce((sum, item) => sum + item.size, 0),
  }
}

async function collectDirectoryEntries(
  hyper: HyperModuleConfig,
  drive: Awaited<ReturnType<typeof getPeerDrive>>,
  driveKey: string,
  resourcePath: string,
  targetPath: string,
) {
  const entries: DownloadEntry[] = []
  let discoveredFiles = 0
  const normalizedRoot = resourcePath === '/' ? '/' : resourcePath.replace(/\/+$/, '')

  for await (const entry of drive.list(normalizedRoot)) {
    if (!entry.value.blob || isInternalPath(entry.key)) {
      continue
    }

    discoveredFiles += 1

    const relative = normalizedRoot === '/'
      ? normalizeRelativeResourcePath(entry.key)
      : normalizeRelativeResourcePath(path.posix.relative(normalizedRoot, entry.key))

    const nextEntry = {
      sourcePath: entry.key,
      targetPath: path.join(targetPath, relative),
      size: entry.value.blob.byteLength,
    }

    if (await shouldSkipDirectoryEntry(nextEntry)) {
      await upsertDownloadedResourceRecord(hyper, {
        driveKey,
        resourcePath: nextEntry.sourcePath,
        targetPath: nextEntry.targetPath,
        kind: 'file',
      })
      continue
    }

    entries.push(nextEntry)
  }

  return {
    entries,
    discoveredFiles,
  } satisfies DirectoryEntriesResult
}

async function shouldSkipDirectoryEntry(entry: DownloadEntry) {
  try {
    const stats = await fsp.stat(entry.targetPath)
    return stats.isFile() && stats.size === entry.size
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function markDirectoryAsDownloaded(hyper: HyperModuleConfig, job: DownloadJob) {
  if (job.kind !== 'directory') {
    return
  }

  await upsertDownloadedResourceRecord(hyper, {
    driveKey: job.driveKey,
    resourcePath: job.resourcePath,
    targetPath: job.targetPath,
    kind: 'directory',
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

function normalizeNodePath(resourcePath: string) {
  return path.posix.normalize(resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`)
}

function sanitizeTargetName(targetName?: string) {
  const normalized = targetName?.trim()

  if (!normalized) {
    return ''
  }

  return normalized.replace(/[\\/]+/g, '-')
}

function isInternalPath(entryPath: string) {
  return entryPath === '/.cinereel' || entryPath.startsWith('/.cinereel/')
}

function isSidecarFile(entryPath: string) {
  const baseName = path.posix.basename(entryPath).toLowerCase()
  return SIDECAR_FILE_NAMES.has(baseName) || baseName.endsWith('.nfo')
}

function isAncestorResourcePath(candidatePath: string, resourcePath: string) {
  if (candidatePath === '/' || candidatePath === resourcePath) {
    return false
  }

  const normalizedCandidate = candidatePath.replace(/\/+$/, '')
  return resourcePath.startsWith(`${normalizedCandidate}/`)
}

async function removeEmptyParentDirectories(startPath: string) {
  let currentPath = startPath

  while (currentPath && currentPath !== path.dirname(currentPath)) {
    try {
      const entries = await fsp.readdir(currentPath)

      if (entries.length > 0) {
        return
      }

      await fsp.rmdir(currentPath)
      currentPath = path.dirname(currentPath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code

      if (code === 'ENOENT' || code === 'ENOTEMPTY') {
        return
      }

      throw error
    }
  }
}
