import b4a from 'b4a'
import type { HyperModuleConfig } from '../../infra/hyper/types'
import { listLibraryEntries } from '../library/service'

type RemoteDriveSession = {
  drive: ReturnType<HyperModuleConfig['createPeerDrive']>
}

const remoteSessions = new WeakMap<HyperModuleConfig, Map<string, RemoteDriveSession>>()

export async function fetchRemoteLibrary(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  if (!/^[0-9a-f]{64}$/i.test(driveKey)) {
    throw new Error('driveKey 格式无效，应为 64 位十六进制字符串。')
  }

  // If the requested key is the current node's own drive, read locally instead
  // of waiting for replication over the swarm.
  if (driveKey.toLowerCase() === hyper.driveKey.toLowerCase()) {
    const data = await listLibraryEntries(hyper.drive)

    return {
      success: true,
      data,
      total: data.length,
    }
  }

  const peerDrive = await getPeerDrive(hyper, driveKey)

  try {
    // Try to use already replicated metadata first. This makes repeated reads
    // stable even if the peer is not rediscovered immediately for every request.
    await peerDrive.update({ wait: false })
    const cachedEntries = await listLibraryEntries(peerDrive)

    if (cachedEntries.length > 0) {
      return {
        success: true,
        data: cachedEntries,
        total: cachedEntries.length,
      }
    }

    return await Promise.race([
      (async () => {
        await peerDrive.update({ wait: true })
        const data = await listLibraryEntries(peerDrive)

        return {
          success: true,
          data,
          total: data.length,
        }
      })(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('获取远端资料库超时，对端可能离线。')), 10_000)
      }),
    ])
  } catch (error) {
    // One forced refresh after a timeout helps when the previous replication
    // session was stale but the peer is still reachable.
    if (error instanceof Error && error.message.includes('超时')) {
      await peerDrive.update({ wait: false }).catch(() => {})
      const fallbackEntries = await listLibraryEntries(peerDrive)

      if (fallbackEntries.length > 0) {
        return {
          success: true,
          data: fallbackEntries,
          total: fallbackEntries.length,
        }
      }
    }

    throw error
  }
}

export async function getPeerDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  if (driveKey.toLowerCase() === hyper.driveKey.toLowerCase()) {
    return hyper.drive
  }

  let sessionMap = remoteSessions.get(hyper)

  if (!sessionMap) {
    sessionMap = new Map()
    remoteSessions.set(hyper, sessionMap)
  }

  const normalizedKey = driveKey.toLowerCase()
  const existing = sessionMap.get(normalizedKey)

  if (existing) {
    return existing.drive
  }

  const keyBuffer = b4a.from(normalizedKey, 'hex')
  const drive = hyper.createPeerDrive(keyBuffer)
  await drive.ready()
  hyper.swarm.join(drive.discoveryKey, { server: false, client: true })
  sessionMap.set(normalizedKey, { drive })
  return drive
}
