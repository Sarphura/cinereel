import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import b4a from 'b4a'
import Hyperdrive from 'hyperdrive'
import type {
  DriveSummaryRecord,
  HyperModuleConfig,
  PublicationTreeNode,
} from '../../infra/hyper/types'
import { getPeerDrive } from '../remote/service'
import { listPublishedResources } from '../publication/service'
import { listSubscriptions, removeSubscription } from '../subscription/service'

interface LocalDriveRecord {
  driveKey: string
  namespace: string
  label: string
  createdAt: number
}

const LOCAL_DRIVES_FILE = 'local-drives.json'

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
          drive,
          driveKey: record.driveKey,
          createdAt: record.createdAt,
          label: record.label,
          isLocal: true,
        })
      } finally {
        await close()
      }
    }),
  )

  const remoteRecords = await Promise.all(
    subscriptions.map(async (subscription) => {
      const drive = await getPeerDrive(hyper, subscription.driveKey)

      return buildDriveSummary({
        drive,
        driveKey: subscription.driveKey,
        createdAt: subscription.createdAt,
        label: `Drive ${subscription.driveKey.slice(0, 8)}`,
        isLocal: false,
      })
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
  label?: string,
): Promise<DriveSummaryRecord> {
  const localDrives = await listLocalDriveRecords(hyper)
  const nextLabel = label?.trim() || `我的 Drive ${localDrives.length + 1}`
  const namespace = buildDriveNamespace()
  const driveStore = hyper.store.namespace(namespace)
  const drive = new Hyperdrive(driveStore)
  await drive.ready()
  hyper.swarm.join(drive.discoveryKey, { server: true, client: false })

  const driveKey = b4a.toString(drive.key, 'hex')
  const now = Date.now()
  const record: LocalDriveRecord = {
    driveKey,
    namespace,
    label: nextLabel,
    createdAt: now,
  }

  localDrives.unshift(record)
  await writeLocalDrives(hyper, localDrives)

  const result = {
    driveKey: record.driveKey,
    createdAt: record.createdAt,
    label: record.label,
    updatedAt: record.createdAt,
    fileCount: 0,
    totalSize: 0,
    publicationCount: 0,
    isLocal: true,
  }

  await drive.close()
  await driveStore.close()

  return result
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
  hyper.swarm.join(drive.discoveryKey, { server: true, client: false })

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

  const { drive, close } = await resolveDrive(hyper, driveKey)
  const rootNode: PublicationTreeNode = {
    path: '/',
    name: localDriveRecord?.label ?? `Drive ${driveKey.slice(0, 8)}`,
    type: 'directory',
    size: 0,
    updatedAt: Date.now(),
    children: [],
  }

  const nodes = new Map<string, PublicationTreeNode>([['/', rootNode]])
  let latestUpdatedAt = 0

  try {
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

  rootNode.updatedAt = latestUpdatedAt || rootNode.updatedAt
  sortTree(rootNode)
  return rootNode
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
    await writeLocalDrives(hyper, localDrives)

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

    return {
      driveKey: normalizedKey,
      deleted: true,
      label: removedDrive.label,
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
  drive: Hyperdrive
  driveKey: string
  createdAt: number
  label: string
  isLocal: boolean
}): Promise<DriveSummaryRecord> {
  const publications = await listPublishedResources(input.drive)
  const fileCount = publications.reduce((sum, item) => sum + item.fileCount, 0)
  const totalSize = publications.reduce((sum, item) => sum + item.totalSize, 0)
  const updatedAt = publications.reduce(
    (latest, item) => Math.max(latest, item.updatedAt),
    input.createdAt,
  )

  return {
    driveKey: input.driveKey.toLowerCase(),
    label: input.label,
    createdAt: input.createdAt,
    updatedAt,
    fileCount,
    totalSize,
    publicationCount: publications.length,
    isLocal: input.isLocal,
  }
}

async function resolveDrive(
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
  hyper.swarm.join(drive.discoveryKey, { server: true, client: false })
  return {
    drive,
    close: async () => {
      await drive.close()
      await driveStore.close()
    },
  }
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
  const records = await readLocalDrives(hyper)
  const filteredRecords = records.filter((record) => record.namespace !== 'main')

  if (filteredRecords.length !== records.length) {
    await writeLocalDrives(hyper, filteredRecords)
  }

  return filteredRecords
}

async function readLocalDrives(hyper: HyperModuleConfig) {
  const filePath = path.join(hyper.storeDir, LOCAL_DRIVES_FILE)

  try {
    const content = await fs.readFile(filePath, 'utf8')
    const data = JSON.parse(content) as LocalDriveRecord[]
    return Array.isArray(data)
      ? data.filter(
          (record) =>
            typeof record?.driveKey === 'string'
            && typeof record?.namespace === 'string'
            && typeof record?.label === 'string'
            && typeof record?.createdAt === 'number',
        )
      : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function writeLocalDrives(
  hyper: HyperModuleConfig,
  records: LocalDriveRecord[],
) {
  const filePath = path.join(hyper.storeDir, LOCAL_DRIVES_FILE)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(records, null, 2), 'utf8')
}

function buildDriveNamespace() {
  return `local-drive-${crypto.randomUUID()}`
}
