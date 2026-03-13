import fs from 'node:fs/promises'
import path from 'node:path'
import type Hyperdrive from 'hyperdrive'
import Localdrive from 'localdrive'
import MirrorDrive from 'mirror-drive'
import type { MountResult } from '../../infra/hyper/types'
import { buildPublicationRecord, upsertPublishedResource } from '../publication/service'

export async function mountLocalPath(
  drive: Hyperdrive,
  targetPath: string,
  displayName?: string,
): Promise<MountResult> {
  const resolvedTargetPath = path.resolve(targetPath)
  const stats = await fs.stat(resolvedTargetPath)
  const rootDir = path.dirname(resolvedTargetPath)
  const rootName = path.basename(resolvedTargetPath)
  const prefix = `/${rootName}`
  const localdrive = new Localdrive(rootDir)
  const mirror = new MirrorDrive(localdrive, drive, {
    prefix,
    prune: false,
    batch: true,
    ignore: shouldIgnoreEntry,
  })

  const operations: MountResult['operations'] = []

  for await (const operation of mirror) {
    operations.push({
      type: operation.op,
      key: operation.key,
      bytesAdded: operation.bytesAdded,
      bytesRemoved: operation.bytesRemoved,
    })
  }

  const publicationStats = await collectMountedStats(drive, prefix)

  const publication = await upsertPublishedResource(
    drive,
    buildPublicationRecord({
      mountedPath: prefix,
      kind: stats.isDirectory() ? 'directory' : 'file',
      sourcePath: resolvedTargetPath,
      displayName,
      fileCount: publicationStats.fileCount,
      totalSize: publicationStats.totalSize,
    }),
  )

  return {
    sourcePath: resolvedTargetPath,
    mountedPath: prefix,
    kind: stats.isDirectory() ? 'directory' : 'file',
    filesDiscovered: mirror.count.files,
    filesAdded: mirror.count.add,
    filesChanged: mirror.count.change,
    filesRemoved: mirror.count.remove,
    bytesAdded: mirror.bytesAdded,
    bytesRemoved: mirror.bytesRemoved,
    operations,
    publication,
  }
}

async function collectMountedStats(drive: Hyperdrive, prefix: string) {
  let fileCount = 0
  let totalSize = 0

  for await (const entry of drive.list(prefix)) {
    if (!entry.value.blob) {
      continue
    }

    fileCount += 1
    totalSize += entry.value.blob.byteLength
  }

  return {
    fileCount,
    totalSize,
  }
}

function shouldIgnoreEntry(entryPath: string) {
  return path.posix.basename(entryPath).startsWith('.')
}
