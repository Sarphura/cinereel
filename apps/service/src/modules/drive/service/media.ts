import fs from 'node:fs/promises'
import path from 'node:path'
import type { HyperModuleConfig } from '../../../base/hyper/types'
import { getSubscribedDriveBaseCacheDir } from '../../download/service'
import { readMediaIndex, type MediaIndexEntry, type MediaMetadataRecord } from '../../scan/store'
import { readDriveDescriptor } from '../descriptor'
import { listSubscribedDrives } from '../../subscribed-drive/service'
import type { CollectionDriveContentType } from '../entity/schema'
import { matchesMediaIndexFilter, normalizeNodePath, withTimeout } from '../util/utils'
import { listOwnedDriveRecords, openReadableDrive } from './core'

const REMOTE_MEDIA_INDEX_TIMEOUT_MS = 1500

export async function getDriveMediaIndex(
  hyper: HyperModuleConfig,
  driveKey: string,
  resourcePath?: string,
) {
  const normalizedKey = driveKey.toLowerCase()
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === normalizedKey)
  const subscribedDrives = await listSubscribedDrives(hyper)
  const subscribedDriveRecord = subscribedDrives.find((record) => record.driveKey === normalizedKey)
  const isSubscribedRemote = Boolean(subscribedDriveRecord)

  if (!ownedDriveRecord && !isSubscribedRemote && normalizedKey !== hyper.driveKey.toLowerCase()) {
    throw new Error('找不到对应的 Drive。')
  }

  const normalizedResourcePath = resourcePath?.trim()
    ? normalizeNodePath(resourcePath)
    : null
  const { drive, close } = await openReadableDrive(hyper, driveKey)
  const fallbackType = subscribedDriveRecord?.type ?? 'generic'
  const fallbackResponse = {
    version: 1,
    driveKey: normalizedKey,
    path: normalizedResourcePath,
    total: 0,
    items: [],
  }

  try {
    const loadMediaIndex = async () => {
      const descriptor = isSubscribedRemote ? null : await readDriveDescriptor(drive)
      const driveType = descriptor?.kind === 'collection' ? descriptor.type : fallbackType
      const document = await readMediaIndex(drive)
      const items = await enrichMediaIndexItemsWithCacheMetadata(
        Object.values(document.items)
          .filter((entry) => matchesMediaIndexFilter(entry, normalizedResourcePath))
          .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN')),
        driveType,
      )

      return {
        version: document.version,
        driveKey: normalizedKey,
        path: normalizedResourcePath,
        total: items.length,
        items,
      }
    }

    if (isSubscribedRemote) {
      return await withTimeout(
        loadMediaIndex().catch((error) => {
          hyper.log.warn({
            driveKey: normalizedKey,
            error: error instanceof Error ? error.message : String(error),
          }, 'Remote drive media index unavailable, falling back to empty payload')
          return fallbackResponse
        }),
        REMOTE_MEDIA_INDEX_TIMEOUT_MS,
        fallbackResponse,
      )
    }

    return await loadMediaIndex()
  } finally {
    await close()
  }
}

async function enrichMediaIndexItemsWithCacheMetadata(
  items: MediaIndexEntry[],
  driveType: CollectionDriveContentType,
) {
  if ((driveType !== 'movie' && driveType !== 'series') || items.length === 0) {
    return items
  }

  const cacheRoot = path.join(
    getSubscribedDriveBaseCacheDir(),
    driveType === 'movie' ? 'movies' : 'series',
  )
  const metadataCache = new Map<string, MediaMetadataRecord | null>()

  return Promise.all(items.map(async (item) => ({
    ...item,
    metadata: await resolveMediaMetadataForPath(item.path, cacheRoot, metadataCache),
  })))
}

async function resolveMediaMetadataForPath(
  mediaPath: string,
  cacheRoot: string,
  metadataCache: Map<string, MediaMetadataRecord | null>,
) {
  const candidateDirs = collectCandidateResourceDirectories(mediaPath)

  for (const candidateDir of candidateDirs) {
    if (metadataCache.has(candidateDir)) {
      const cached = metadataCache.get(candidateDir)
      if (cached) {
        return cached
      }
      continue
    }

    const metadata = await readCacheMetadataForDirectory(candidateDir, cacheRoot)
    metadataCache.set(candidateDir, metadata)

    if (metadata) {
      return metadata
    }
  }

  return null
}

function collectCandidateResourceDirectories(mediaPath: string) {
  const candidates: string[] = []
  let currentPath = path.posix.dirname(mediaPath)

  while (currentPath && currentPath !== '.') {
    candidates.push(currentPath)

    if (currentPath === '/') {
      break
    }

    const nextPath = path.posix.dirname(currentPath) || '/'
    if (nextPath === currentPath) {
      break
    }
    currentPath = nextPath
  }

  return candidates
}

async function readCacheMetadataForDirectory(
  resourceDir: string,
  cacheRoot: string,
): Promise<MediaMetadataRecord | null> {
  const localDir = path.join(cacheRoot, ...resourceDir.split('/').filter(Boolean))

  try {
    const entries = await fs.readdir(localDir, { withFileTypes: true })
    const fileNames = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)

    const posterName = fileNames.find((name) => name.toLowerCase() === 'poster.jpg') ?? null
    const fanartName = fileNames.find((name) => name.toLowerCase() === 'fanart.jpg') ?? null
    const nfoName = fileNames.find((name) => name.toLowerCase().endsWith('.nfo')) ?? null

    if (!posterName && !fanartName && !nfoName) {
      return null
    }

    const nfoMetadata = nfoName
      ? await readNfoMetadata(path.join(localDir, nfoName))
      : null

    return {
      ...nfoMetadata,
      posterPath: posterName ? `${resourceDir.replace(/\/+$/, '')}/${posterName}` : null,
      fanartPath: fanartName ? `${resourceDir.replace(/\/+$/, '')}/${fanartName}` : null,
      nfoPath: nfoName ? `${resourceDir.replace(/\/+$/, '')}/${nfoName}` : null,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function readNfoMetadata(nfoPath: string): Promise<MediaMetadataRecord | null> {
  try {
    const raw = await fs.readFile(nfoPath, 'utf8')

    return {
      title: readNfoTag(raw, 'title'),
      originalTitle: readNfoTag(raw, 'originaltitle'),
      plot: readNfoTag(raw, 'plot'),
      premiered: readNfoTag(raw, 'premiered'),
      year: readNfoNumber(raw, 'year'),
      rating: readNfoNumber(raw, 'rating'),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

function readNfoTag(xml: string, tagName: string) {
  const matched = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i').exec(xml)

  if (!matched?.[1]) {
    return null
  }

  const value = matched[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

  return value || null
}

function readNfoNumber(xml: string, tagName: string) {
  const value = readNfoTag(xml, tagName)

  if (!value) {
    return null
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}
