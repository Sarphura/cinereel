import type { HyperModuleConfig } from '../../infra/hyper/types'
import { withConfigDatabase } from '../../infra/config-store'
import { readDriveDescriptor } from '../profile/schema'
import { getPeerDrive } from '../remote/service'

export interface SubscriptionRecord {
  driveKey: string
  name?: string
  remark?: string
  createdAt: number
}

export async function listSubscriptions(
  hyper: HyperModuleConfig,
): Promise<SubscriptionRecord[]> {
  return withConfigDatabase(hyper.storeDir, (db) => (
    db.prepare(`
      SELECT drive_key, name, remark, created_at
      FROM subscriptions
      ORDER BY created_at DESC
    `).all().map((record) => ({
      driveKey: String((record as Record<string, unknown>).drive_key),
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

export async function addSubscription(
  hyper: HyperModuleConfig,
  driveKey: string,
  name?: string,
): Promise<SubscriptionRecord> {
  const normalizedKey = normalizeDriveKey(driveKey)
  const normalizedName = normalizeName(name)
  const descriptorName = await readDescriptorName(hyper, normalizedKey)
  const nextName = descriptorName ?? normalizedName

  return withConfigDatabase(hyper.storeDir, (db) => {
    const existing = db.prepare(`
      SELECT drive_key, name, remark, created_at
      FROM subscriptions
      WHERE drive_key = ?
    `).get(normalizedKey) as Record<string, unknown> | undefined

    if (existing) {
      if (nextName && existing.name !== nextName) {
        db.prepare(`
          UPDATE subscriptions
          SET name = ?
          WHERE drive_key = ?
        `).run(nextName, normalizedKey)
      }

      return {
        driveKey: normalizedKey,
        name: nextName ?? normalizeName(typeof existing.name === 'string' ? String(existing.name) : undefined),
        remark: normalizeName(typeof existing.remark === 'string' ? String(existing.remark) : undefined),
        createdAt: Number(existing.created_at),
      }
    }

    const record: SubscriptionRecord = {
      driveKey: normalizedKey,
      name: nextName,
      createdAt: Date.now(),
    }

    db.prepare(`
      INSERT INTO subscriptions (drive_key, name, remark, created_at)
      VALUES (?, ?, NULL, ?)
    `).run(record.driveKey, record.name ?? null, record.createdAt)

    return record
  })
}

export async function updateSubscriptionRemark(
  hyper: HyperModuleConfig,
  driveKey: string,
  remark?: string,
): Promise<SubscriptionRecord> {
  const normalizedKey = normalizeDriveKey(driveKey)
  const normalizedRemark = normalizeName(remark)
  return withConfigDatabase(hyper.storeDir, (db) => {
    const existing = db.prepare(`
      SELECT drive_key, name, remark, created_at
      FROM subscriptions
      WHERE drive_key = ?
    `).get(normalizedKey) as Record<string, unknown> | undefined

    if (!existing) {
      throw new Error('订阅不存在。')
    }

    const currentRemark = normalizeName(typeof existing.remark === 'string' ? String(existing.remark) : undefined)

    if (currentRemark !== normalizedRemark) {
      db.prepare(`
        UPDATE subscriptions
        SET remark = ?
        WHERE drive_key = ?
      `).run(normalizedRemark ?? null, normalizedKey)
    }

      return {
        driveKey: normalizedKey,
        name: normalizeName(typeof existing.name === 'string' ? String(existing.name) : undefined),
        remark: normalizedRemark,
        createdAt: Number(existing.created_at),
      }
  })
}

export async function removeSubscription(
  hyper: HyperModuleConfig,
  driveKey: string,
): Promise<SubscriptionRecord> {
  const normalizedKey = normalizeDriveKey(driveKey)
  return withConfigDatabase(hyper.storeDir, (db) => {
    const existing = db.prepare(`
      SELECT drive_key, name, remark, created_at
      FROM subscriptions
      WHERE drive_key = ?
    `).get(normalizedKey) as Record<string, unknown> | undefined

    if (!existing) {
      throw new Error('订阅不存在。')
    }

    db.prepare(`
      DELETE FROM subscriptions
      WHERE drive_key = ?
    `).run(normalizedKey)

    return {
      driveKey: normalizedKey,
      name: normalizeName(typeof existing.name === 'string' ? String(existing.name) : undefined),
      remark: normalizeName(typeof existing.remark === 'string' ? String(existing.remark) : undefined),
      createdAt: Number(existing.created_at),
    }
  })
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

async function readDescriptorName(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  try {
    const drive = await getPeerDrive(hyper, driveKey)
    await drive.update({ wait: false }).catch(() => {})
    const descriptor = await readDriveDescriptor(drive)
    return normalizeName(descriptor?.name)
  } catch {
    return undefined
  }
}
