import crypto from 'node:crypto'
import b4a from 'b4a'
import Hyperdrive from 'hyperdrive'
import type {
  DriveSummaryRecord,
  HyperModuleConfig,
} from '../../../base/hyper/types'
import { withConfigDatabase } from '../../../base/config-store'
import {
  type CollectionDriveContentType,
} from '../entity/schema'
import {
  readCollectionDriveDescriptor,
  readDriveDescriptor,
  writeDriveDescriptor,
} from '../descriptor'
import {
  ensureProfileIdentity,
  removeProfileCollection,
  upsertProfileCollection,
} from '../../profile/service'
import { getPeerDrive } from '../../remote/service'
import { listPublishedResources } from '../../publication/service'
import { listSubscribedDrives, removeSubscribedDrive } from '../../subscribed-drive/service'
import { normalizeOptionalText, withTimeout } from '../util/utils'

export interface OwnedDriveRecord {
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

export async function buildDriveSummary(input: {
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

export async function openOwnedDriveForRead(
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

export async function listOwnedDriveRecords(
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
