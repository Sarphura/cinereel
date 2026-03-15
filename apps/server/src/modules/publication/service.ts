import path from 'node:path'
import type Hyperdrive from 'hyperdrive'
import type {
  PublicationTreeNode,
  PublishedResourceRecord,
} from '../../infra/hyper/types'

const INTERNAL_PREFIX = '/.cinereel'
const PUBLICATIONS_MANIFEST_PATH = `${INTERNAL_PREFIX}/publications.json`

type PublicationsManifest = {
  version: 1
  publications: PublishedResourceRecord[]
}

export function isInternalLibraryPath(entryPath: string) {
  return entryPath === INTERNAL_PREFIX || entryPath.startsWith(`${INTERNAL_PREFIX}/`)
}

export function buildPublicationRecord(input: {
  mountedPath: string
  kind: 'file' | 'directory'
  sourcePath: string
  fileCount: number
  totalSize: number
}) {
  const now = Date.now()
  const normalizedRootPath = normalizeDrivePath(input.mountedPath)
  const sourceName = path.basename(input.sourcePath)

  return {
    id: encodePublicationId(normalizedRootPath),
    sourceName,
    sourcePath: input.sourcePath,
    rootPath: normalizedRootPath,
    kind: input.kind,
    createdAt: now,
    updatedAt: now,
    fileCount: input.fileCount,
    totalSize: input.totalSize,
  } satisfies PublishedResourceRecord
}

export async function listPublishedResources(drive: Hyperdrive): Promise<PublishedResourceRecord[]> {
  const manifest = await readManifest(drive)
  return manifest.publications
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function getPublishedResource(
  drive: Hyperdrive,
  publicationId: string,
) {
  const manifest = await readManifest(drive)
  return manifest.publications.find((record) => record.id === publicationId) ?? null
}

export async function getPublishedResourceTree(
  drive: Hyperdrive,
  publicationId: string,
): Promise<PublicationTreeNode | null> {
  const publication = await getPublishedResource(drive, publicationId)

  if (!publication) {
    return null
  }

  const rootEntry = await drive.entry(publication.rootPath, { wait: false })
  const rootUpdatedAt = rootEntry?.mtime ?? publication.updatedAt

  const rootNode: PublicationTreeNode = {
    path: publication.rootPath,
    name: publication.sourceName,
    type: publication.kind,
    size: publication.totalSize,
    updatedAt: rootUpdatedAt,
    children: publication.kind === 'directory' ? [] : undefined,
  }

  const nodes = new Map<string, PublicationTreeNode>([[publication.rootPath, rootNode]])

  for await (const entry of drive.list(publication.rootPath)) {
    if (entry.key === publication.rootPath) {
      continue
    }

    const node: PublicationTreeNode = {
      path: entry.key,
      name: path.posix.basename(entry.key),
      type: entry.value.blob ? 'file' : 'directory',
      size: entry.value.blob?.byteLength ?? 0,
      updatedAt: entry.mtime ?? publication.updatedAt,
      children: entry.value.blob ? undefined : [],
    }

    nodes.set(entry.key, node)

    const parentPath = path.posix.dirname(entry.key)
    const parentNode = nodes.get(parentPath)

    if (parentNode) {
      parentNode.children ??= []
      parentNode.children.push(node)
    }
  }

  sortPublicationTree(rootNode)
  return rootNode
}

export async function upsertPublishedResource(
  drive: Hyperdrive,
  nextRecord: PublishedResourceRecord,
) {
  const manifest = await readManifest(drive)
  const existingIndex = manifest.publications.findIndex((record) => record.id === nextRecord.id)

  if (existingIndex === -1) {
    manifest.publications.unshift(nextRecord)
  } else {
    const existing = manifest.publications[existingIndex]
    manifest.publications[existingIndex] = {
      ...existing,
      ...nextRecord,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    }
  }

  await drive.put(PUBLICATIONS_MANIFEST_PATH, Buffer.from(JSON.stringify(manifest, null, 2)))

  return manifest.publications.find((record) => record.id === nextRecord.id) ?? nextRecord
}

export async function deletePublishedResource(
  drive: Hyperdrive,
  publicationId: string,
) {
  const manifest = await readManifest(drive)
  const publicationIndex = manifest.publications.findIndex((record) => record.id === publicationId)

  if (publicationIndex === -1) {
    throw new Error('找不到要删除的发布对象。')
  }

  const [publication] = manifest.publications.splice(publicationIndex, 1)
  await removeDrivePath(drive, publication.rootPath)
  await writeManifest(drive, manifest)
  return publication
}

async function readManifest(drive: Hyperdrive): Promise<PublicationsManifest> {
  const emptyManifest = createEmptyManifest()
  let manifestEntry: Awaited<ReturnType<Hyperdrive['entry']>>

  try {
    manifestEntry = await drive.entry(PUBLICATIONS_MANIFEST_PATH, { wait: false })
  } catch (error) {
    if (isManifestUnavailableError(error)) {
      return emptyManifest
    }

    throw error
  }

  if (!manifestEntry?.value.blob) {
    return emptyManifest
  }

  let buffer: Awaited<ReturnType<Hyperdrive['get']>>

  try {
    buffer = await drive.get(PUBLICATIONS_MANIFEST_PATH, { wait: false })
  } catch (error) {
    if (isManifestUnavailableError(error)) {
      return emptyManifest
    }

    throw error
  }

  if (!buffer) {
    return emptyManifest
  }

  try {
    const data = JSON.parse(buffer.toString()) as Partial<PublicationsManifest>
    return {
      version: 1,
      publications: Array.isArray(data.publications)
        ? data.publications.filter(isPublishedResourceRecord)
        : [],
    }
  } catch {
    return emptyManifest
  }
}

async function writeManifest(drive: Hyperdrive, manifest: PublicationsManifest) {
  await drive.put(PUBLICATIONS_MANIFEST_PATH, Buffer.from(JSON.stringify(manifest, null, 2)))
}

async function removeDrivePath(drive: Hyperdrive, rootPath: string) {
  const paths = new Set<string>()

  if (await drive.entry(rootPath, { wait: false })) {
    paths.add(rootPath)
  }

  for await (const entry of drive.list(rootPath)) {
    paths.add(entry.key)
  }

  const sortedPaths = Array.from(paths).sort((left, right) => right.length - left.length)

  for (const entryPath of sortedPaths) {
    await drive.clear(entryPath).catch(() => {})
    await drive.del(entryPath)
  }
}

function isPublishedResourceRecord(value: unknown): value is PublishedResourceRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string'
    && typeof candidate.sourceName === 'string'
    && (candidate.sourcePath === undefined || typeof candidate.sourcePath === 'string')
    && typeof candidate.rootPath === 'string'
    && (candidate.kind === 'file' || candidate.kind === 'directory')
    && typeof candidate.createdAt === 'number'
    && typeof candidate.updatedAt === 'number'
    && typeof candidate.fileCount === 'number'
    && typeof candidate.totalSize === 'number'
}

function normalizeDrivePath(value: string) {
  const normalized = path.posix.normalize(value.startsWith('/') ? value : `/${value}`)
  return normalized === '.' ? '/' : normalized
}

function encodePublicationId(rootPath: string) {
  return Buffer.from(rootPath).toString('base64url')
}

function createEmptyManifest(): PublicationsManifest {
  return {
    version: 1,
    publications: [],
  }
}

function isManifestUnavailableError(error: unknown) {
  return !!error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'BLOCK_NOT_AVAILABLE'
}

function sortPublicationTree(node: PublicationTreeNode) {
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
    sortPublicationTree(child)
  }
}
