import type { HyperModuleConfig } from '../../base/hyper/types'
import { withConfigDatabase } from '../../base/config-store'
import { readDriveDescriptor } from '../drive/descriptor'
import type { CollectionDriveContentType } from '../drive/entity/schema'
import { syncSubscribedDriveCache } from '../download/service'
import { deleteMoviesForDrive, rebuildMovieIndexForDrive } from '../movies/service'
import { getPeerDrive } from '../remote/service'

export interface SubscribedDriveRecord {
  driveKey: string
  name?: string
  type: CollectionDriveContentType
  remark?: string
  createdAt: number
}

export async function listSubscribedDrives(
  hyper: HyperModuleConfig,
): Promise<SubscribedDriveRecord[]> {
  return withConfigDatabase(hyper.storeDir, (db) => (
    db.prepare(`
      SELECT drive_key, name, type, remark, created_at
      FROM subscribed_drives
      ORDER BY created_at DESC
    `).all().map((record) => ({
      driveKey: String((record as Record<string, unknown>).drive_key),
      type: normalizeDriveType((record as Record<string, unknown>).type),
      createdAt: Number((record as Record<string, unknown>).created_at),
      name: normalizeName(typeof (record as Record<string, unknown>).name === 'string'
        ? String((record as Record<string, unknown>).name)
        : undefined),
      remark: normalizeName(typeof (record as Record<string, unknown>).remark === 'string'
        ? String((record as Record<string, unknown>).remark)
        : undefined),
    }))
  ))
}

export async function addSubscribedDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
  name?: string,
): Promise<SubscribedDriveRecord> {
  const normalizedKey = normalizeDriveKey(driveKey)
  const normalizedName = normalizeName(name)
  const remoteMetadata = await readDescriptorMetadata(hyper, normalizedKey)
  const nextName = remoteMetadata.name ?? normalizedName
  const nextType = remoteMetadata.type ?? 'generic'

  const record = withConfigDatabase(hyper.storeDir, (db) => {
    const existing = db.prepare(`
      SELECT drive_key, name, type, remark, created_at
      FROM subscribed_drives
      WHERE drive_key = ?
    `).get(normalizedKey) as Record<string, unknown> | undefined

    if (existing) {
      const currentName = normalizeName(typeof existing.name === 'string' ? String(existing.name) : undefined)
      const currentType = normalizeDriveType(existing.type)

      if (nextName !== currentName || nextType !== currentType) {
        db.prepare(`
          UPDATE subscribed_drives
          SET name = ?, type = ?
          WHERE drive_key = ?
        `).run(nextName ?? null, nextType, normalizedKey)
      }

      return {
        driveKey: normalizedKey,
        name: nextName ?? currentName,
        type: nextType,
        remark: normalizeName(typeof existing.remark === 'string' ? String(existing.remark) : undefined),
        createdAt: Number(existing.created_at),
      }
    }

    const record: SubscribedDriveRecord = {
      driveKey: normalizedKey,
      name: nextName,
      type: nextType,
      createdAt: Date.now(),
    }

    db.prepare(`
      INSERT INTO subscribed_drives (drive_key, name, type, remark, created_at)
      VALUES (?, ?, ?, NULL, ?)
    `).run(record.driveKey, record.name ?? null, record.type, record.createdAt)

    return record
  })

  if (record.type === 'movie' || record.type === 'series') {
    await syncSubscribedDriveCache(hyper, record.driveKey, record.type)
  }

  if (record.type === 'movie') {
    await rebuildMovieIndexForDrive(hyper, record.driveKey)
  } else {
    await deleteMoviesForDrive(hyper, record.driveKey)
  }

  return record
}

export async function updateSubscribedDriveRemark(
  hyper: HyperModuleConfig,
  driveKey: string,
  remark?: string,
): Promise<SubscribedDriveRecord> {
  const normalizedKey = normalizeDriveKey(driveKey)
  const normalizedRemark = normalizeName(remark)
  return withConfigDatabase(hyper.storeDir, (db) => {
    const existing = db.prepare(`
      SELECT drive_key, name, type, remark, created_at
      FROM subscribed_drives
      WHERE drive_key = ?
    `).get(normalizedKey) as Record<string, unknown> | undefined

    if (!existing) {
      throw new Error('订阅不存在。')
    }

    const currentRemark = normalizeName(typeof existing.remark === 'string' ? String(existing.remark) : undefined)

    if (currentRemark !== normalizedRemark) {
      db.prepare(`
        UPDATE subscribed_drives
        SET remark = ?
        WHERE drive_key = ?
      `).run(normalizedRemark ?? null, normalizedKey)
    }

    return {
      driveKey: normalizedKey,
      name: normalizeName(typeof existing.name === 'string' ? String(existing.name) : undefined),
      type: normalizeDriveType(existing.type),
      remark: normalizedRemark,
      createdAt: Number(existing.created_at),
    }
  })
}

export async function removeSubscribedDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
): Promise<SubscribedDriveRecord> {
  const normalizedKey = normalizeDriveKey(driveKey)
  const record = withConfigDatabase(hyper.storeDir, (db) => {
    const existing = db.prepare(`
      SELECT drive_key, name, type, remark, created_at
      FROM subscribed_drives
      WHERE drive_key = ?
    `).get(normalizedKey) as Record<string, unknown> | undefined

    if (!existing) {
      throw new Error('订阅不存在。')
    }

    db.prepare(`
      DELETE FROM subscribed_drives
      WHERE drive_key = ?
    `).run(normalizedKey)

    return {
      driveKey: normalizedKey,
      name: normalizeName(typeof existing.name === 'string' ? String(existing.name) : undefined),
      type: normalizeDriveType(existing.type),
      remark: normalizeName(typeof existing.remark === 'string' ? String(existing.remark) : undefined),
      createdAt: Number(existing.created_at),
    }
  })

  await deleteMoviesForDrive(hyper, normalizedKey)
  return record
}

function normalizeDriveKey(driveKey: string) {
  const normalized = driveKey.trim().toLowerCase()

  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('订阅公钥格式无效，应为 64 位十六进制字符串。')
  }

  return normalized
}

function normalizeName(value?: string) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

async function readDescriptorMetadata(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  try {
    const drive = await getPeerDrive(hyper, driveKey)
    await drive.update({ wait: false }).catch(() => {})
    const descriptor = await readDriveDescriptor(drive)
    return {
      name: normalizeName(descriptor?.name),
      type: descriptor?.kind === 'collection' ? descriptor.type : undefined,
    }
  } catch {
    return {
      name: undefined,
      type: undefined,
    }
  }
}

function normalizeDriveType(value: unknown): CollectionDriveContentType {
  return value === 'movie' || value === 'series' || value === 'music'
    ? value
    : 'generic'
}
