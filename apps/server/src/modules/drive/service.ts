import crypto from 'node:crypto'
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
  readDriveDescriptor,
  writeDriveDescriptor,
} from '../profile/schema'
import {
  ensureProfileIdentity,
  removeProfileCollection,
  upsertProfileCollection,
} from '../profile/service'
import { getPeerDrive } from '../remote/service'
import { listPublishedResources } from '../publication/service'
import { listSubscriptions, removeSubscription } from '../subscription/service'
import { getDownloadedResourceDirectoryMap } from '../download/service'

interface LocalDriveRecord {
  driveKey: string
  namespace: string
  name: string
  remark?: string
  createdAt: number
}

const REMOTE_DRIVE_SUMMARY_TIMEOUT_MS = 1500
export async function listDrives(
  hyper: HyperModuleConfig,
): Promise<DriveSummaryRecord[]> {
  const localDrives = await listLocalDriveRecords(hyper)
  const subscriptions = await listSubscriptions(hyper)
  const localRecords = await Promise.all(
    localDrives.map(async (record) => {
      const { drive, close } = await openLocalDriveForRead(hyper, record)

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
    subscriptions.map(async (subscription) => {
      const fallbackRecord: DriveSummaryRecord = {
        driveKey: subscription.driveKey,
        name: subscription.name?.trim() || `Drive ${subscription.driveKey.slice(0, 8)}`,
        remark: subscription.remark,
        createdAt: subscription.createdAt,
        updatedAt: subscription.createdAt,
        fileCount: 0,
        totalSize: 0,
        publicationCount: 0,
        peerCount: 0,
        isLocal: false,
      }

      try {
        const drive = await getPeerDrive(hyper, subscription.driveKey)
        await drive.update({ wait: false }).catch(() => {})

        return await withTimeout(
          buildDriveSummary({
            hyper,
            drive,
            driveKey: subscription.driveKey,
            createdAt: subscription.createdAt,
            name: fallbackRecord.name,
            remark: subscription.remark,
            isLocal: false,
          }),
          REMOTE_DRIVE_SUMMARY_TIMEOUT_MS,
          fallbackRecord,
        )
      } catch (error) {
        hyper.log.warn(
          {
            driveKey: subscription.driveKey,
            error: error instanceof Error ? error.message : String(error),
          },
          'Remote drive summary unavailable, falling back to cached subscription metadata',
        )

        return fallbackRecord
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

export async function createDrive(
  hyper: HyperModuleConfig,
  name?: string,
): Promise<DriveSummaryRecord> {
  await ensureProfileIdentity(hyper)
  const localDrives = await listLocalDriveRecords(hyper)
  const nextName = name?.trim() || `我的 Drive ${localDrives.length + 1}`
  const namespace = buildDriveNamespace()
  const driveStore = hyper.store.namespace(namespace)
  const drive = new Hyperdrive(driveStore)
  await drive.ready()
  await hyper.ensureDriveDiscovery(drive.discoveryKey)

  const driveKey = b4a.toString(drive.key, 'hex')
  const now = Date.now()
  const record: LocalDriveRecord = {
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
  await writeDriveDescriptor(drive, {
    kind: 'collection',
    name: record.name,
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
    createdAt: record.createdAt,
    name: record.name,
    updatedAt: record.createdAt,
    fileCount: 0,
    totalSize: 0,
    publicationCount: 0,
    peerCount: 0,
    isLocal: true,
  }

  await drive.close()
  await driveStore.close()

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

  const localDrives = await listLocalDriveRecords(hyper)
  const localDriveRecord = localDrives.find((record) => record.driveKey === normalizedKey)

  if (!localDriveRecord) {
    throw new Error('只能改名本地 Drive。')
  }

  localDriveRecord.name = nextName
  withConfigDatabase(hyper.storeDir, (db) => {
    db.prepare(`
      UPDATE owned_drives
      SET name = ?
      WHERE drive_key = ?
    `).run(nextName, normalizedKey)
  })

  const { drive, close } = await openLocalDriveForRead(hyper, localDriveRecord)

  try {
    await writeDriveDescriptor(drive, {
      kind: 'collection',
      name: nextName,
      ownerProfileDriveKey: hyper.driveKey,
    })
    await upsertProfileCollection(hyper, {
      driveKey: localDriveRecord.driveKey,
      name: nextName,
      addedAt: localDriveRecord.createdAt,
      updatedAt: Date.now(),
    })

    return await buildDriveSummary({
      hyper,
      drive,
      driveKey: localDriveRecord.driveKey,
      createdAt: localDriveRecord.createdAt,
      name: localDriveRecord.name,
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
  const localDrives = await listLocalDriveRecords(hyper)
  const localDriveRecord = localDrives.find((record) => record.driveKey === normalizedKey)

  if (!localDriveRecord) {
    throw new Error('只能修改本地 Drive 备注。')
  }

  if (localDriveRecord.remark === nextRemark) {
    const { drive, close } = await openLocalDriveForRead(hyper, localDriveRecord)

    try {
      return await buildDriveSummary({
        hyper,
        drive,
        driveKey: localDriveRecord.driveKey,
        createdAt: localDriveRecord.createdAt,
        name: localDriveRecord.name,
        remark: localDriveRecord.remark,
        isLocal: true,
      })
    } finally {
      await close()
    }
  }

  localDriveRecord.remark = nextRemark
  withConfigDatabase(hyper.storeDir, (db) => {
    db.prepare(`
      UPDATE owned_drives
      SET remark = ?
      WHERE drive_key = ?
    `).run(nextRemark ?? null, normalizedKey)
  })

  const { drive, close } = await openLocalDriveForRead(hyper, localDriveRecord)

  try {
    return await buildDriveSummary({
      hyper,
      drive,
      driveKey: localDriveRecord.driveKey,
      createdAt: localDriveRecord.createdAt,
      name: localDriveRecord.name,
      remark: localDriveRecord.remark,
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
  const localDrives = await listLocalDriveRecords(hyper)
  const localDriveRecord = localDrives.find((record) => record.driveKey === normalizedKey)

  if (!localDriveRecord) {
    throw new Error('只能向本地 Drive 发布内容。')
  }

  const driveStore = hyper.store.namespace(localDriveRecord.namespace)
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
  const localDrives = await listLocalDriveRecords(hyper)
  const localDriveRecord = localDrives.find((record) => record.driveKey === driveKey.toLowerCase())
  const subscriptions = await listSubscriptions(hyper)
  const isSubscribedRemote = subscriptions.some((record) => record.driveKey === driveKey.toLowerCase())

  if (!localDriveRecord && !isSubscribedRemote) {
    throw new Error('找不到对应的 Drive。')
  }

  const { drive, close } = await openReadableDrive(hyper, driveKey)
  const localDirectoryMap = await getDownloadedResourceDirectoryMap(hyper, driveKey)
  const descriptor = await readDriveDescriptor(drive)
  const rootNode: PublicationTreeNode = {
    path: '/',
    name: descriptor?.name
      ?? localDriveRecord?.name
      ?? subscriptions.find((record) => record.driveKey === driveKey.toLowerCase())?.name
      ?? `Drive ${driveKey.slice(0, 8)}`,
    type: 'directory',
    size: 0,
    updatedAt: Date.now(),
    children: [],
  }

  const nodes = new Map<string, PublicationTreeNode>([['/', rootNode]])
  let latestUpdatedAt = 0

  try {
    if (localDriveRecord) {
      const publicationSourceMap = await getLocalPublicationSourcePathMap(drive)

      for (const [resourcePath, sourcePath] of publicationSourceMap) {
        localDirectoryMap.set(resourcePath, sourcePath)
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
        localDirPath: localDirectoryMap.get(normalizedPath) ?? null,
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

  for (const node of nodes.values()) {
    node.localDirPath = localDirectoryMap.get(node.path) ?? node.localDirPath ?? null
  }

  for (const node of nodes.values()) {
    if (node.localDirPath || node.path === '/') {
      continue
    }

    const parentPath = path.posix.dirname(node.path) || '/'
    const parentNode = nodes.get(parentPath)

    if (parentNode?.localDirPath) {
      node.localDirPath = path.join(parentNode.localDirPath, node.name)
    }
  }

  inferDownloadedDirectoryPaths(rootNode)

  rootNode.updatedAt = latestUpdatedAt || rootNode.updatedAt
  sortTree(rootNode)
  return rootNode
}

export async function getDriveDescriptor(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const normalizedKey = driveKey.toLowerCase()
  const localDrives = await listLocalDriveRecords(hyper)
  const localDriveRecord = localDrives.find((record) => record.driveKey === normalizedKey)
  const subscriptions = await listSubscriptions(hyper)
  const isSubscribedRemote = subscriptions.some((record) => record.driveKey === normalizedKey)

  if (!localDriveRecord && !isSubscribedRemote && normalizedKey !== hyper.driveKey.toLowerCase()) {
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

export async function getLocalPublishedResourceTargetPath(
  hyper: HyperModuleConfig,
  driveKey: string,
  resourcePath: string,
) {
  const normalizedKey = driveKey.trim().toLowerCase()
  const normalizedResourcePath = normalizeNodePath(resourcePath)
  const localDrives = await listLocalDriveRecords(hyper)
  const localDriveRecord = localDrives.find((record) => record.driveKey === normalizedKey)

  if (!localDriveRecord) {
    return null
  }

  const { drive, close } = await openLocalDriveForRead(hyper, localDriveRecord)

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
  const localDrives = await listLocalDriveRecords(hyper)
  const localIndex = localDrives.findIndex((record) => record.driveKey === normalizedKey)

  if (localIndex !== -1) {
    const [removedDrive] = localDrives.splice(localIndex, 1)
    withConfigDatabase(hyper.storeDir, (db) => {
      db.prepare(`
        DELETE FROM owned_drives
        WHERE drive_key = ?
      `).run(normalizedKey)
    })

    try {
      const { drive, close } = await openLocalDriveForRead(hyper, removedDrive)

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

  const subscriptions = await listSubscriptions(hyper)
  const subscribed = subscriptions.some((record) => record.driveKey === normalizedKey)

  if (subscribed) {
    return removeSubscription(hyper, normalizedKey)
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
  const localDrives = await listLocalDriveRecords(hyper)
  const localDriveRecord = localDrives.find((record) => record.driveKey === normalizedKey)

  if (localDriveRecord) {
    return openLocalDriveForRead(hyper, localDriveRecord)
  }

  const drive = await getPeerDrive(hyper, driveKey)
  await drive.update({ wait: false }).catch(() => {})
  return {
    drive,
    close: async () => {},
  }
}

async function openLocalDriveForRead(
  hyper: HyperModuleConfig,
  driveRecord: LocalDriveRecord,
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

async function getLocalPublicationSourcePathMap(drive: Hyperdrive) {
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
    node.localDirPath = firstFileChildPath
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

async function listLocalDriveRecords(
  hyper: HyperModuleConfig,
): Promise<LocalDriveRecord[]> {
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
  return `local-drive-${crypto.randomUUID()}`
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
