import type Hyperdrive from 'hyperdrive'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'

const DEFAULT_ATTEMPTS = 5
const DEFAULT_DELAY_MS = 200

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 带 wait 与短暂重试地读取 Drive 内 JSON。
 * 用于订阅后远端 metadata 尚未完全到齐的短窗口。
 */
export async function readDriveJsonWithRetry<T>(
  driveQuery: DriveQueryService,
  path: string,
  drive: Hyperdrive,
  options?: {
    attempts?: number
    delayMs?: number
  },
): Promise<T | null> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const data = await driveQuery.getJson<T>(path, true, drive)
    if (data !== null && data !== undefined) {
      return data
    }

    if (attempt < attempts) {
      await sleep(delayMs * attempt)
    }
  }

  return null
}

export function isDrivePublicKey(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value)
}
