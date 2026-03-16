import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import b4a from 'b4a'
import Hyperdrive from 'hyperdrive'
import type {
  DriveSummaryRecord,
  HyperModuleConfig,
  PublicationTreeNode,
} from '../../infra/hyper/types'
import { withConfigDatabase } from '../../infra/config-store'
import {
  type CollectionDriveContentType,
} from './schema'
import {
  readCollectionDriveDescriptor,
  readDriveDescriptor,
  writeDriveDescriptor,
} from './descriptor'
import {
  ensureProfileIdentity,
  removeProfileCollection,
  upsertProfileCollection,
} from '../profile/service'
import { getPeerDrive } from '../remote/service'
import { listPublishedResources } from '../publication/service'
import { listSubscribedDrives, removeSubscribedDrive } from '../subscribed-drive/service'
import { getDownloadedResourceDirectoryMap, getSubscribedDriveBaseCacheDir } from '../download/service'
import {
  getFailedFileMap,
  matchesRootPath,
  readMediaIndex,
  readScanStatusDocument,
  type MediaIndexEntry,
  type MediaMetadataRecord,
} from '../scan/store'
import { syncPublishedResourcesFromLocal } from '../mount/service'

interface OwnedDriveRecord {
  driveKey: string
  namespace: string
  name: string
  remark?: string
  createdAt: number
}

const REMOTE_DRIVE_SUMMARY_TIMEOUT_MS = 1500
const REMOTE_MEDIA_INDEX_TIMEOUT_MS = 1500
export async function listDrives(
  hyper: HyperModuleConfig,
): Promise<DriveSummaryRecord[]> {
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const subscribedDrives = await listSubscribedDrives(hyper)
  const localRecords = await Promise.all(
    ownedDrives.map(async (record) => {
      const { drive, close } = await openOwnedDriveForRead(hyper, record)

      try {
        return await buildDriveSummary({
          hyper,
          drive,
          driveKey: record.driveKey,
          createdAt: record.createdAt,
          name: record.name,
          remark: record.remark,
          isLocal: true,
        })
      } finally {
        await close()
      }
    }),
  )

  const remoteRecords = await Promise.all(
    subscribedDrives.map(async (subscribedDrive) => {
      const baseFallbackRecord: DriveSummaryRecord = {
        driveKey: subscribedDrive.driveKey,
        name: subscribedDrive.name?.trim() || `Drive ${subscribedDrive.driveKey.slice(0, 8)}`,
        type: subscribedDrive.type,
        remark: subscribedDrive.remark,
        createdAt: subscribedDrive.createdAt,
        updatedAt: subscribedDrive.createdAt,
        fileCount: 0,
        totalSize: 0,
        publicationCount: 0,
        peerCount: 0,
        isLocal: false,
      }

      try {
        const drive = await getPeerDrive(hyper, subscribedDrive.driveKey)
        await drive.update({ wait: false }).catch(() => {})
        const fallbackRecord: DriveSummaryRecord = {
          ...baseFallbackRecord,
          peerCount: await hyper.getDriveDiscoveryCount(drive.discoveryKey),
        }

        return await withTimeout(
          buildDriveSummary({
            hyper,
            drive,
            driveKey: subscribedDrive.driveKey,
            createdAt: subscribedDrive.createdAt,
            name: fallbackRecord.name,
            fallbackType: subscribedDrive.type,
            remark: subscribedDrive.remark,
            isLocal: false,
          }),
          REMOTE_DRIVE_SUMMARY_TIMEOUT_MS,
          fallbackRecord,
        )
      } catch (error) {
        hyper.log.warn(
          {
            driveKey: subscribedDrive.driveKey,
            error: error instanceof Error ? error.message : String(error),
          },
          'Remote drive summary unavailable, falling back to cached subscribed drive metadata',
        )

        return baseFallbackRecord
      }
    }),
  )

  return [...localRecords, ...remoteRecords].sort((left, right) => {
    if (left.isLocal !== right.isLocal) {
      return left.isLocal ? -1 : 1
    }

    return right.updatedAt - left.updatedAt
  })
}

async function createOwnedDrive(
  hyper: HyperModuleConfig,
  name?: string,
) {
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const nextName = name?.trim() || `我的 Drive ${ownedDrives.length + 1}`
  const namespace = buildDriveNamespace()
  const driveStore = hyper.store.namespace(namespace)
  const drive = new Hyperdrive(driveStore)
  await drive.ready()
  await hyper.ensureDriveDiscovery(drive.discoveryKey)

  const driveKey = b4a.toString(drive.key, 'hex')
  const now = Date.now()
  const record: OwnedDriveRecord = {
    driveKey,
    namespace,
    name: nextName,
    createdAt: now,
  }

  withConfigDatabase(hyper.storeDir, (db) => {
    db.prepare(`
      INSERT INTO owned_drives (drive_key, namespace, name, remark, created_at)
      VALUES (?, ?, ?, NULL, ?)
    `).run(record.driveKey, record.namespace, record.name, record.createdAt)
  })

  return {
    drive,
    driveStore,
    record,
    close: async () => {
      await drive.close()
      await driveStore.close()
    },
  }
}

export async function createCollectionDrive(
  hyper: HyperModuleConfig,
  name?: string,
  type: CollectionDriveContentType = 'generic',
): Promise<DriveSummaryRecord> {
  await ensureProfileIdentity(hyper)
  const { drive, record, close } = await createOwnedDrive(hyper, name)
  await writeDriveDescriptor(drive, {
    kind: 'collection',
    name: record.name,
    type,
    ownerProfileDriveKey: hyper.driveKey,
  })
  await upsertProfileCollection(hyper, {
    driveKey: record.driveKey,
    name: record.name,
    addedAt: record.createdAt,
    updatedAt: record.createdAt,
  })

  const result = {
    driveKey: record.driveKey,
    type,
    createdAt: record.createdAt,
    name: record.name,
    updatedAt: record.createdAt,
    fileCount: 0,
    totalSize: 0,
    publicationCount: 0,
    peerCount: 0,
    isLocal: true,
  }

  await close()

  return result
}

export async function renameDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
  name: string,
): Promise<DriveSummaryRecord> {
  const normalizedKey = driveKey.toLowerCase()
  const nextName = name.trim()

  if (!nextName) {
    throw new Error('Drive 名称不能为空。')
  }

  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === normalizedKey)

  if (!ownedDriveRecord) {
    throw new Error('只能改名本地 Drive。')
  }

  ownedDriveRecord.name = nextName
  withConfigDatabase(hyper.storeDir, (db) => {
    db.prepare(`
      UPDATE owned_drives
      SET name = ?
      WHERE drive_key = ?
    `).run(nextName, normalizedKey)
  })

  const { drive, close } = await openOwnedDriveForRead(hyper, ownedDriveRecord)

  try {
    const descriptor = await readCollectionDriveDescriptor(drive)

    if (!descriptor) {
      throw new Error('当前 Drive 不是 collection drive。')
    }

    await writeDriveDescriptor(drive, {
      kind: 'collection',
      name: nextName,
      type: descriptor.type,
      ownerProfileDriveKey: hyper.driveKey,
    })
    await upsertProfileCollection(hyper, {
      driveKey: ownedDriveRecord.driveKey,
      name: nextName,
      addedAt: ownedDriveRecord.createdAt,
      updatedAt: Date.now(),
    })

    return await buildDriveSummary({
      hyper,
      drive,
      driveKey: ownedDriveRecord.driveKey,
      createdAt: ownedDriveRecord.createdAt,
      name: ownedDriveRecord.name,
      isLocal: true,
    })
  } finally {
    await close()
  }
}

export async function updateOwnedDriveRemark(
  hyper: HyperModuleConfig,
  driveKey: string,
  remark?: string,
): Promise<DriveSummaryRecord> {
  const normalizedKey = driveKey.toLowerCase()
  const nextRemark = normalizeOptionalText(remark)
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === normalizedKey)

  if (!ownedDriveRecord) {
    throw new Error('只能修改本地 Drive 备注。')
  }

  if (ownedDriveRecord.remark === nextRemark) {
    const { drive, close } = await openOwnedDriveForRead(hyper, ownedDriveRecord)

    try {
      return await buildDriveSummary({
        hyper,
        drive,
        driveKey: ownedDriveRecord.driveKey,
        createdAt: ownedDriveRecord.createdAt,
        name: ownedDriveRecord.name,
        remark: ownedDriveRecord.remark,
        isLocal: true,
      })
    } finally {
      await close()
    }
  }

  ownedDriveRecord.remark = nextRemark
  withConfigDatabase(hyper.storeDir, (db) => {
    db.prepare(`
      UPDATE owned_drives
      SET remark = ?
      WHERE drive_key = ?
    `).run(nextRemark ?? null, normalizedKey)
  })

  const { drive, close } = await openOwnedDriveForRead(hyper, ownedDriveRecord)

  try {
    return await buildDriveSummary({
      hyper,
      drive,
      driveKey: ownedDriveRecord.driveKey,
      createdAt: ownedDriveRecord.createdAt,
      name: ownedDriveRecord.name,
      remark: ownedDriveRecord.remark,
      isLocal: true,
    })
  } finally {
    await close()
  }
}

export async function openWritableDrive(
  hyper: HyperModuleConfig,
  driveKey?: string,
) {
  if (!driveKey?.trim()) {
    throw new Error('请先新建并选择一个 Drive。')
  }

  const normalizedKey = driveKey.toLowerCase()
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === normalizedKey)

  if (!ownedDriveRecord) {
    throw new Error('只能向本地 Drive 发布内容。')
  }

  const driveStore = hyper.store.namespace(ownedDriveRecord.namespace)
  const drive = new Hyperdrive(driveStore)
  await drive.ready()
  await hyper.ensureDriveDiscovery(drive.discoveryKey)

  return {
    drive,
    close: async () => {
      await drive.close()
      await driveStore.close()
    },
  }
}

export async function getDriveTree(
  hyper: HyperModuleConfig,
  driveKey: string,
): Promise<PublicationTreeNode> {
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === driveKey.toLowerCase())
  const subscribedDrives = await listSubscribedDrives(hyper)
  const isSubscribedRemote = subscribedDrives.some((record) => record.driveKey === driveKey.toLowerCase())

  if (!ownedDriveRecord && !isSubscribedRemote) {
    throw new Error('找不到对应的 Drive。')
  }

  const { drive, close } = await openReadableDrive(hyper, driveKey)
  const localPathMap = await getDownloadedResourceDirectoryMap(hyper, driveKey)
  const descriptor = await readDriveDescriptor(drive)
  const rootNode: PublicationTreeNode = {
    path: '/',
    name: descriptor?.name
      ?? ownedDriveRecord?.name
      ?? subscribedDrives.find((record) => record.driveKey === driveKey.toLowerCase())?.name
      ?? `Drive ${driveKey.slice(0, 8)}`,
    type: 'directory',
    size: 0,
    updatedAt: Date.now(),
    children: [],
  }
  const scanStatus = await readScanStatusDocument(drive)
  const failedFileMap = getFailedFileMap(scanStatus.roots)

  const nodes = new Map<string, PublicationTreeNode>([['/', rootNode]])
  let latestUpdatedAt = 0
  let publicationSourceMap = new Map<string, string>()

  try {
    if (ownedDriveRecord) {
      publicationSourceMap = await getOwnedPublicationSourcePathMap(drive)

      for (const [resourcePath, sourcePath] of publicationSourceMap) {
        localPathMap.set(resourcePath, sourcePath)
      }
    }

    for await (const entry of drive.list('/')) {
      if (isInternalPath(entry.key)) {
        continue
      }

      const normalizedPath = normalizeNodePath(entry.key)
      if (normalizedPath === '/') {
        continue
      }

      ensureDirectoryAncestors(nodes, normalizedPath, rootNode.updatedAt)

      const node: PublicationTreeNode = {
        path: normalizedPath,
        name: path.posix.basename(normalizedPath),
        type: entry.value.blob ? 'file' : 'directory',
        size: entry.value.blob?.byteLength ?? 0,
        updatedAt: entry.mtime ?? rootNode.updatedAt,
        localDirPath: localPathMap.get(normalizedPath)
          ? path.dirname(localPathMap.get(normalizedPath)!)
          : null,
        scanStatus: failedFileMap.has(normalizedPath) ? 'failed' : null,
        scanError: failedFileMap.get(normalizedPath)?.error ?? null,
        children: entry.value.blob ? undefined : [],
      }

      nodes.set(normalizedPath, node)

      const parentPath = path.posix.dirname(normalizedPath) || '/'
      const parentNode = nodes.get(parentPath)

      if (parentNode && !parentNode.children?.some((child) => child.path === normalizedPath)) {
        parentNode.children ??= []
        parentNode.children.push(node)
      }

      latestUpdatedAt = Math.max(latestUpdatedAt, node.updatedAt)
    }
  } finally {
    await close()
  }

  if (ownedDriveRecord && publicationSourceMap.size > 0) {
    for (const [resourcePath, sourcePath] of publicationSourceMap) {
      const mergedUpdatedAt = await mergeLocalPublicationTree(
        nodes,
        resourcePath,
        sourcePath,
        failedFileMap,
        rootNode.updatedAt,
      )
      latestUpdatedAt = Math.max(latestUpdatedAt, mergedUpdatedAt)
    }
  }

  for (const node of nodes.values()) {
    const localPath = localPathMap.get(node.path)
    node.localDirPath = localPath ? path.dirname(localPath) : node.localDirPath ?? null
  }

  for (const node of nodes.values()) {
    if (node.localDirPath || node.path === '/') {
      continue
    }

    const parentPath = path.posix.dirname(node.path) || '/'
    const parentNode = nodes.get(parentPath)
    const parentLocalPath = localPathMap.get(parentPath)

    if (parentNode?.localDirPath && parentLocalPath) {
      const localPath = path.join(parentLocalPath, node.name)
      localPathMap.set(node.path, localPath)
      node.localDirPath = path.dirname(localPath)
    }
  }

  inferDownloadedDirectoryPaths(rootNode)

  rootNode.updatedAt = latestUpdatedAt || rootNode.updatedAt
  sortTree(rootNode)
  return rootNode
}

export async function refreshDriveFromSource(
  hyper: HyperModuleConfig,
  driveKey: string,
): Promise<PublicationTreeNode> {
  const normalizedKey = driveKey.toLowerCase()
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === normalizedKey)

  if (!ownedDriveRecord) {
    throw new Error('只能刷新本地 Drive。')
  }

  const { drive, close } = await openWritableDrive(hyper, normalizedKey)

  try {
    await syncPublishedResourcesFromLocal(drive)
  } finally {
    await close()
  }

  return getDriveTree(hyper, normalizedKey)
}

export async function getDriveDescriptor(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const normalizedKey = driveKey.toLowerCase()
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === normalizedKey)
  const subscribedDrives = await listSubscribedDrives(hyper)
  const isSubscribedRemote = subscribedDrives.some((record) => record.driveKey === normalizedKey)

  if (!ownedDriveRecord && !isSubscribedRemote && normalizedKey !== hyper.driveKey.toLowerCase()) {
    throw new Error('找不到对应的 Drive。')
  }

  const { drive, close } = await openReadableDrive(hyper, driveKey)

  try {
    const descriptor = await readDriveDescriptor(drive)

    if (!descriptor) {
      throw new Error('当前 Drive 未设置 descriptor。')
    }

    return descriptor
  } finally {
    await close()
  }
}

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

export async function getOwnedPublishedResourceTargetPath(
  hyper: HyperModuleConfig,
  driveKey: string,
  resourcePath: string,
) {
  const normalizedKey = driveKey.trim().toLowerCase()
  const normalizedResourcePath = normalizeNodePath(resourcePath)
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === normalizedKey)

  if (!ownedDriveRecord) {
    return null
  }

  const { drive, close } = await openOwnedDriveForRead(hyper, ownedDriveRecord)

  try {
    const publications = await listPublishedResources(drive)

    for (const publication of publications) {
      const sourcePath = publication.sourcePath?.trim()

      if (!sourcePath) {
        continue
      }

      if (publication.kind === 'file') {
        if (publication.rootPath === normalizedResourcePath) {
          return sourcePath
        }

        continue
      }

      if (
        normalizedResourcePath !== publication.rootPath
        && !normalizedResourcePath.startsWith(`${publication.rootPath}/`)
      ) {
        continue
      }

      const relativePath = path.posix.relative(publication.rootPath, normalizedResourcePath)

      if (!relativePath || relativePath === '.') {
        return sourcePath
      }

      if (relativePath.startsWith('../') || relativePath.includes('/../')) {
        continue
      }

      return path.join(sourcePath, ...relativePath.split('/'))
    }

    return null
  } finally {
    await close()
  }
}

export async function deleteDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const normalizedKey = driveKey.toLowerCase()
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const localIndex = ownedDrives.findIndex((record) => record.driveKey === normalizedKey)

  if (localIndex !== -1) {
    const [removedDrive] = ownedDrives.splice(localIndex, 1)
    withConfigDatabase(hyper.storeDir, (db) => {
      db.prepare(`
        DELETE FROM owned_drives
        WHERE drive_key = ?
      `).run(normalizedKey)
    })

    try {
      const { drive, close } = await openOwnedDriveForRead(hyper, removedDrive)

      try {
        await clearDrive(drive)
      } finally {
        await close()
      }
    } catch (error) {
      hyper.log.warn(
        {
          driveKey: normalizedKey,
          error: error instanceof Error ? error.message : String(error),
        },
        'Drive record removed but backing store cleanup failed',
      )
    }

    await removeProfileCollection(hyper, normalizedKey)

    return {
      driveKey: normalizedKey,
      deleted: true,
      name: removedDrive.name,
    }
  }

  const subscribedDrives = await listSubscribedDrives(hyper)
  const subscribed = subscribedDrives.some((record) => record.driveKey === normalizedKey)

  if (subscribed) {
    return removeSubscribedDrive(hyper, normalizedKey)
  }

  return {
    driveKey: normalizedKey,
    deleted: true,
  }
}

async function buildDriveSummary(input: {
  hyper: HyperModuleConfig
  drive: Hyperdrive
  driveKey: string
  createdAt: number
  name: string
  fallbackType?: CollectionDriveContentType
  remark?: string
  isLocal: boolean
}): Promise<DriveSummaryRecord> {
  const descriptor = await readDriveDescriptor(input.drive)
  const publications = await listPublishedResources(input.drive)
  const fileCount = publications.reduce((sum, item) => sum + item.fileCount, 0)
  const totalSize = publications.reduce((sum, item) => sum + item.totalSize, 0)
  const updatedAt = publications.reduce(
    (latest, item) => Math.max(latest, item.updatedAt),
    input.createdAt,
  )
  const peerCount = await input.hyper.getDriveDiscoveryCount(input.drive.discoveryKey)

  return {
    driveKey: input.driveKey.toLowerCase(),
    name: descriptor?.name || input.name,
    type: descriptor?.kind === 'collection' ? descriptor.type : (input.fallbackType ?? 'generic'),
    remark: input.remark,
    createdAt: input.createdAt,
    updatedAt,
    fileCount,
    totalSize,
    publicationCount: publications.length,
    peerCount,
    isLocal: input.isLocal,
  }
}

export async function openReadableDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const normalizedKey = driveKey.toLowerCase()
  const ownedDrives = await listOwnedDriveRecords(hyper)
  const ownedDriveRecord = ownedDrives.find((record) => record.driveKey === normalizedKey)

  if (ownedDriveRecord) {
    return openOwnedDriveForRead(hyper, ownedDriveRecord)
  }

  const drive = await getPeerDrive(hyper, driveKey)
  await drive.update({ wait: false }).catch(() => {})
  return {
    drive,
    close: async () => {},
  }
}

async function openOwnedDriveForRead(
  hyper: HyperModuleConfig,
  driveRecord: OwnedDriveRecord,
) {
  const driveStore = hyper.store.namespace(driveRecord.namespace)
  const drive = new Hyperdrive(driveStore)
  await drive.ready()
  await hyper.ensureDriveDiscovery(drive.discoveryKey)
  return {
    drive,
    close: async () => {
      await drive.close()
      await driveStore.close()
    },
  }
}

async function getOwnedPublicationSourcePathMap(drive: Hyperdrive) {
  const publications = await listPublishedResources(drive)
  const mapping = new Map<string, string>()

  for (const publication of publications) {
    const sourcePath = publication.sourcePath?.trim()

    if (!sourcePath) {
      continue
    }

    mapping.set(publication.rootPath, sourcePath)
  }

  return mapping
}

function normalizeNodePath(input: string) {
  const normalized = path.posix.normalize(input.startsWith('/') ? input : `/${input}`)
  return normalized === '.' ? '/' : normalized
}

function matchesMediaIndexFilter(
  entry: MediaIndexEntry,
  resourcePath: string | null,
) {
  if (!resourcePath) {
    return true
  }

  return matchesRootPath(entry.path, resourcePath)
}

function isInternalPath(entryPath: string) {
  return entryPath === '/.cinereel' || entryPath.startsWith('/.cinereel/')
}

function ensureDirectoryAncestors(
  nodes: Map<string, PublicationTreeNode>,
  nodePath: string,
  updatedAt: number,
) {
  const segments = nodePath.split('/').filter(Boolean)
  let currentPath = ''

  for (let index = 0; index < segments.length - 1; index += 1) {
    currentPath += `/${segments[index]}`

    if (nodes.has(currentPath)) {
      continue
    }

    const parentPath = path.posix.dirname(currentPath) || '/'
    const parentNode = nodes.get(parentPath)

    const directoryNode: PublicationTreeNode = {
      path: currentPath,
      name: path.posix.basename(currentPath),
      type: 'directory',
      size: 0,
      updatedAt,
      children: [],
    }

    nodes.set(currentPath, directoryNode)

    if (parentNode && !parentNode.children?.some((child) => child.path === currentPath)) {
      parentNode.children ??= []
      parentNode.children.push(directoryNode)
    }
  }
}

async function mergeLocalPublicationTree(
  nodes: Map<string, PublicationTreeNode>,
  rootPath: string,
  sourcePath: string,
  failedFileMap: Map<string, { error: string }>,
  defaultUpdatedAt: number,
) {
  const normalizedRootPath = normalizeNodePath(rootPath)
  const trimmedSourcePath = sourcePath.trim()

  if (!trimmedSourcePath) {
    return 0
  }

  let stats: Awaited<ReturnType<typeof fs.stat>>

  try {
    stats = await fs.stat(trimmedSourcePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0
    }

    throw error
  }

  let latestUpdatedAt = upsertTreeNode(
    nodes,
    normalizedRootPath,
    stats.isDirectory() ? 'directory' : 'file',
    stats.isFile() ? stats.size : 0,
    stats.mtimeMs || defaultUpdatedAt,
    path.dirname(trimmedSourcePath),
    failedFileMap,
  ).updatedAt

  if (!stats.isDirectory()) {
    return latestUpdatedAt
  }

  latestUpdatedAt = Math.max(
    latestUpdatedAt,
    await mergeLocalDirectoryEntries(
      nodes,
      normalizedRootPath,
      trimmedSourcePath,
      failedFileMap,
      defaultUpdatedAt,
    ),
  )

  return latestUpdatedAt
}

async function mergeLocalDirectoryEntries(
  nodes: Map<string, PublicationTreeNode>,
  resourceDirPath: string,
  localDirPath: string,
  failedFileMap: Map<string, { error: string }>,
  defaultUpdatedAt: number,
): Promise<number> {
  let latestUpdatedAt = 0
  const entries = await fs.readdir(localDirPath, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }

    const childLocalPath = path.join(localDirPath, entry.name)
    const childResourcePath = path.posix.join(resourceDirPath, entry.name)

    if (entry.isDirectory()) {
      const stats = await fs.stat(childLocalPath)
      const childNode = upsertTreeNode(
        nodes,
        childResourcePath,
        'directory',
        0,
        stats.mtimeMs || defaultUpdatedAt,
        localDirPath,
        failedFileMap,
      )

      latestUpdatedAt = Math.max(latestUpdatedAt, childNode.updatedAt)
      latestUpdatedAt = Math.max(
        latestUpdatedAt,
        await mergeLocalDirectoryEntries(
          nodes,
          childResourcePath,
          childLocalPath,
          failedFileMap,
          defaultUpdatedAt,
        ),
      )
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const stats = await fs.stat(childLocalPath)
    const childNode = upsertTreeNode(
      nodes,
      childResourcePath,
      'file',
      stats.size,
      stats.mtimeMs || defaultUpdatedAt,
      localDirPath,
      failedFileMap,
    )
    latestUpdatedAt = Math.max(latestUpdatedAt, childNode.updatedAt)
  }

  return latestUpdatedAt
}

function upsertTreeNode(
  nodes: Map<string, PublicationTreeNode>,
  nodePath: string,
  type: 'file' | 'directory',
  size: number,
  updatedAt: number,
  localDirPath: string | null,
  failedFileMap: Map<string, { error: string }>,
) {
  const normalizedPath = normalizeNodePath(nodePath)
  ensureDirectoryAncestors(nodes, normalizedPath, updatedAt)

  const existing = nodes.get(normalizedPath)
  const nextNode: PublicationTreeNode = {
    path: normalizedPath,
    name: path.posix.basename(normalizedPath),
    type,
    size,
    updatedAt,
    localDirPath,
    scanStatus: failedFileMap.has(normalizedPath) ? 'failed' : null,
    scanError: failedFileMap.get(normalizedPath)?.error ?? null,
    children: type === 'directory' ? existing?.children ?? [] : undefined,
  }

  nodes.set(normalizedPath, existing ? {
    ...existing,
    ...nextNode,
    children: type === 'directory' ? nextNode.children ?? [] : undefined,
  } : nextNode)

  const parentPath = path.posix.dirname(normalizedPath) || '/'
  const parentNode = nodes.get(parentPath)
  const currentNode = nodes.get(normalizedPath)!

  if (parentNode && !parentNode.children?.some((child) => child.path === normalizedPath)) {
    parentNode.children ??= []
    parentNode.children.push(currentNode)
  }

  return currentNode
}

function sortTree(node: PublicationTreeNode) {
  if (!node.children?.length) {
    return
  }

  node.children.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1
    }

    return left.name.localeCompare(right.name, 'zh-CN')
  })

  for (const child of node.children) {
    sortTree(child)
  }
}

function inferDownloadedDirectoryPaths(node: PublicationTreeNode): string | null {
  if (node.type === 'file') {
    return node.localDirPath ?? null
  }

  if (!node.children?.length) {
    return node.localDirPath ?? null
  }

  for (const child of node.children) {
    inferDownloadedDirectoryPaths(child)
  }

  if (node.localDirPath) {
    return node.localDirPath
  }

  const directoryChildren = node.children.filter((child) => child.type === 'directory')
  const fileChildren = node.children.filter((child) => child.type === 'file')
  const allDirectoryChildrenReady = directoryChildren.every((child) => Boolean(child.localDirPath))
  const allFileChildrenReady = fileChildren.every((child) => Boolean(child.localDirPath))

  if (!allDirectoryChildrenReady || !allFileChildrenReady) {
    return null
  }

  const firstDirectoryChildPath = directoryChildren[0]?.localDirPath
  if (firstDirectoryChildPath) {
    node.localDirPath = path.dirname(firstDirectoryChildPath)
    return node.localDirPath
  }

  const firstFileChildPath = fileChildren[0]?.localDirPath
  if (firstFileChildPath) {
    node.localDirPath = path.dirname(firstFileChildPath)
    return node.localDirPath
  }

  return null
}

async function clearDrive(drive: Hyperdrive) {
  const entryPaths = new Set<string>()

  for await (const entry of drive.list('/')) {
    entryPaths.add(entry.key)
  }

  const sortedPaths = Array.from(entryPaths).sort((left, right) => right.length - left.length)

  for (const entryPath of sortedPaths) {
    await drive.clear(entryPath).catch(() => {})
    await drive.del(entryPath).catch(() => {})
  }
}

async function listOwnedDriveRecords(
  hyper: HyperModuleConfig,
): Promise<OwnedDriveRecord[]> {
  return withConfigDatabase(hyper.storeDir, (db) => {
    db.prepare(`
      DELETE FROM owned_drives
      WHERE namespace = 'main'
    `).run()

    return db.prepare(`
      SELECT drive_key, namespace, name, remark, created_at
      FROM owned_drives
      ORDER BY created_at DESC
    `).all().map((record) => ({
      driveKey: String((record as Record<string, unknown>).drive_key),
      namespace: String((record as Record<string, unknown>).namespace),
      name: String((record as Record<string, unknown>).name).trim(),
      remark: typeof (record as Record<string, unknown>).remark === 'string'
        ? normalizeOptionalText(String((record as Record<string, unknown>).remark))
        : undefined,
      createdAt: Number((record as Record<string, unknown>).created_at),
    }))
  })
}

function buildDriveNamespace() {
  return `owned-drive-${crypto.randomUUID()}`
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  fallback: T,
) {
  return Promise.race([
    operation,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ])
}
