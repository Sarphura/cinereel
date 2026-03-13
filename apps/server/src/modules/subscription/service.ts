import fs from 'node:fs/promises'
import path from 'node:path'
import type { HyperModuleConfig } from '../../infra/hyper/types'

export interface SubscriptionRecord {
  driveKey: string
  createdAt: number
}

const SUBSCRIPTIONS_FILE = 'subscriptions.json'

export async function listSubscriptions(
  hyper: HyperModuleConfig,
): Promise<SubscriptionRecord[]> {
  const records = await readSubscriptions(hyper)
  return records.sort((left, right) => right.createdAt - left.createdAt)
}

export async function addSubscription(
  hyper: HyperModuleConfig,
  driveKey: string,
): Promise<SubscriptionRecord> {
  const normalizedKey = normalizeDriveKey(driveKey)
  const records = await readSubscriptions(hyper)
  const existing = records.find((record) => record.driveKey === normalizedKey)

  if (existing) {
    return existing
  }

  const record: SubscriptionRecord = {
    driveKey: normalizedKey,
    createdAt: Date.now(),
  }

  records.unshift(record)
  await writeSubscriptions(hyper, records)
  return record
}

export async function removeSubscription(
  hyper: HyperModuleConfig,
  driveKey: string,
): Promise<SubscriptionRecord> {
  const normalizedKey = normalizeDriveKey(driveKey)
  const records = await readSubscriptions(hyper)
  const index = records.findIndex((record) => record.driveKey === normalizedKey)

  if (index === -1) {
    throw new Error('订阅不存在。')
  }

  const [removed] = records.splice(index, 1)
  await writeSubscriptions(hyper, records)
  return removed
}

async function readSubscriptions(hyper: HyperModuleConfig) {
  const filePath = getSubscriptionsPath(hyper)

  try {
    const content = await fs.readFile(filePath, 'utf8')
    const data = JSON.parse(content) as SubscriptionRecord[]
    return Array.isArray(data)
      ? data.filter((record) => typeof record?.driveKey === 'string' && typeof record?.createdAt === 'number')
      : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function writeSubscriptions(
  hyper: HyperModuleConfig,
  records: SubscriptionRecord[],
) {
  const filePath = getSubscriptionsPath(hyper)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(records, null, 2), 'utf8')
}

function getSubscriptionsPath(hyper: HyperModuleConfig) {
  return path.join(hyper.storeDir, SUBSCRIPTIONS_FILE)
}

function normalizeDriveKey(driveKey: string) {
  const normalized = driveKey.trim().toLowerCase()

  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('订阅公钥格式无效，应为 64 位十六进制字符串。')
  }

  return normalized
}
