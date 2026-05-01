import fs from 'node:fs/promises'
import path from 'node:path'
import Hyperdrive from 'hyperdrive'
import type {
  HyperModuleConfig,
  PublicationTreeNode,
} from '../../../base/hyper/types'
import { getDownloadedResourceDirectoryMap } from '../../download/service'
import { listPublishedResources } from '../../publication/service'
import { listSubscribedDrives } from '../../subscribed-drive/service'
import { getFailedFileMap, readScanStatusDocument } from '../../scan/store'
import { readDriveDescriptor } from '../descriptor'
import { syncPublishedResourcesFromLocal } from '../../mount/service'
import { isInternalPath, normalizeNodePath } from '../util/utils'
import { listOwnedDriveRecords, openReadableDrive, openWritableDrive, openOwnedDriveForRead } from './core'

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
