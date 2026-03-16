import type Hyperdrive from 'hyperdrive'
import { INTERNAL_PREFIX } from '../profile/schema'
import type { ScanFailedFileRecord } from '../../infra/hyper/types'

export const MEDIA_INDEX_PATH = `${INTERNAL_PREFIX}/media-index.json`
export const SCAN_STATUS_PATH = `${INTERNAL_PREFIX}/scan-status.json`

export interface MediaStreamRecord {
  codec: string | null
  profile?: string | null
  language?: string | null
  title?: string | null
  bitRate?: number | null
}

export interface MediaVideoRecord extends MediaStreamRecord {
  width: number | null
  height: number | null
  frameRate: number | null
  level: number | null
  bitDepth: number | null
  hdr: string | null
  colorPrimaries?: string | null
  colorTransfer?: string | null
  colorSpace?: string | null
}

export interface MediaAudioRecord extends MediaStreamRecord {
  channels: number | null
  channelLayout?: string | null
  sampleRate?: number | null
}

export interface MediaSubtitleRecord extends MediaStreamRecord {
  forced?: boolean
  default?: boolean
}

export interface MediaIndexEntry {
  path: string
  fileName: string
  container: string | null
  size: number | null
  durationSeconds: number | null
  bitRate: number | null
  video: MediaVideoRecord[]
  audio: MediaAudioRecord[]
  subtitles: MediaSubtitleRecord[]
  scannedAt: number
  metadata?: MediaMetadataRecord | null
}

export interface MediaMetadataRecord {
  title?: string | null
  originalTitle?: string | null
  plot?: string | null
  year?: number | null
  premiered?: string | null
  rating?: number | null
  posterPath?: string | null
  fanartPath?: string | null
  nfoPath?: string | null
}

interface MediaIndexDocument {
  version: 1
  items: Record<string, MediaIndexEntry>
}

export interface ScanRootStatusRecord {
  rootPath: string
  status: 'completed' | 'failed'
  failedFiles: ScanFailedFileRecord[]
  updatedAt: number
}

interface ScanStatusDocument {
  version: 1
  roots: ScanRootStatusRecord[]
}

export async function readMediaIndex(drive: Hyperdrive): Promise<MediaIndexDocument> {
  const buffer = await drive.get(MEDIA_INDEX_PATH).catch(() => null)

  if (!buffer) {
    return {
      version: 1,
      items: {},
    }
  }

  try {
    const parsed = JSON.parse(buffer.toString()) as Partial<MediaIndexDocument>
    return {
      version: 1,
      items: parsed.items && typeof parsed.items === 'object' ? parsed.items as Record<string, MediaIndexEntry> : {},
    }
  } catch {
    return {
      version: 1,
      items: {},
    }
  }
}

export async function writeMediaIndex(
  drive: Hyperdrive,
  document: MediaIndexDocument,
) {
  await drive.put(MEDIA_INDEX_PATH, Buffer.from(JSON.stringify(document, null, 2)))
}

export async function replaceMediaIndexEntries(
  drive: Hyperdrive,
  rootPath: string,
  entries: MediaIndexEntry[],
) {
  const document = await readMediaIndex(drive)
  const nextItems = { ...document.items }

  for (const entryPath of Object.keys(nextItems)) {
    if (matchesRootPath(entryPath, rootPath)) {
      delete nextItems[entryPath]
    }
  }

  for (const entry of entries) {
    nextItems[entry.path] = entry
  }

  await writeMediaIndex(drive, {
    version: 1,
    items: nextItems,
  })
}

export async function removeMediaIndexEntriesByRootPath(
  drive: Hyperdrive,
  rootPath: string,
) {
  const document = await readMediaIndex(drive)
  const nextItems = Object.fromEntries(
    Object.entries(document.items).filter(([entryPath]) => !matchesRootPath(entryPath, rootPath)),
  )

  await writeMediaIndex(drive, {
    version: 1,
    items: nextItems,
  })
}

export async function readScanStatusDocument(
  drive: Hyperdrive,
): Promise<ScanStatusDocument> {
  const buffer = await drive.get(SCAN_STATUS_PATH).catch(() => null)

  if (!buffer) {
    return {
      version: 1,
      roots: [],
    }
  }

  try {
    const parsed = JSON.parse(buffer.toString()) as Partial<ScanStatusDocument>
    return {
      version: 1,
      roots: Array.isArray(parsed.roots) ? parsed.roots.filter(isScanRootStatusRecord) : [],
    }
  } catch {
    return {
      version: 1,
      roots: [],
    }
  }
}

export async function writeScanStatusDocument(
  drive: Hyperdrive,
  document: ScanStatusDocument,
) {
  await drive.put(SCAN_STATUS_PATH, Buffer.from(JSON.stringify(document, null, 2)))
}

export async function upsertScanRootStatus(
  drive: Hyperdrive,
  nextRecord: ScanRootStatusRecord,
) {
  const document = await readScanStatusDocument(drive)
  const filtered = document.roots.filter((record) => record.rootPath !== nextRecord.rootPath)
  filtered.unshift(nextRecord)
  await writeScanStatusDocument(drive, {
    version: 1,
    roots: filtered,
  })
}

export function getFailedFileMap(
  roots: Array<{ rootPath: string; status: 'completed' | 'failed'; failedFiles: ScanFailedFileRecord[] }>,
) {
  const mapping = new Map<string, ScanFailedFileRecord>()

  for (const root of roots) {
    if (root.status !== 'failed') {
      continue
    }

    for (const failedFile of root.failedFiles) {
      if (matchesRootPath(failedFile.path, root.rootPath)) {
        mapping.set(failedFile.path, failedFile)
      }
    }
  }

  return mapping
}

export function matchesRootPath(candidatePath: string, rootPath: string) {
  if (candidatePath === rootPath) {
    return true
  }

  return candidatePath.startsWith(`${rootPath.replace(/\/+$/, '')}/`)
}

function isScanRootStatusRecord(value: unknown): value is ScanRootStatusRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.rootPath === 'string'
    && (candidate.status === 'completed' || candidate.status === 'failed')
    && Array.isArray(candidate.failedFiles)
    && typeof candidate.updatedAt === 'number'
}
