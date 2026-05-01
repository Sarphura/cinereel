import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import type { FastifyBaseLogger } from 'fastify'
import { type HyperModuleConfig, type HyperModuleOptions } from './types'

const STORE_DIR = process.env.CORESTORE_DIR || path.join(os.homedir(), '.cinereel-nas-store')

export async function createHyperModule(
  log: FastifyBaseLogger,
  options: HyperModuleOptions = {},
): Promise<HyperModuleConfig> {
  await fs.mkdir(STORE_DIR, { recursive: true })

  const store = new Corestore(STORE_DIR)
  const drive = new Hyperdrive(store)
  await drive.ready()

  const driveKey = b4a.toString(drive.key, 'hex')
  const networkEnabled = options.network ?? true
  const swarm = networkEnabled ? new Hyperswarm() : null
  const driveDiscoverySessions = new Map<string, { flushed: () => Promise<boolean> }>()

  swarm?.on('connection', (conn, info) => {
    const peerKey = b4a.toString(info.publicKey, 'hex').slice(0, 8)

    log.info({ peer: peerKey }, 'Hypercore peer connected')

    const replication = store.replicate(conn)
    replication.on('error', (error) => {
      if (error.message.includes('ECONNRESET') || error.message.includes('DESTROYED')) {
        return
      }

      log.warn({ peer: peerKey, error: error.message }, 'Replication stream error')
    })

    conn.on('close', () => {
      log.info({ peer: peerKey }, 'Hypercore peer disconnected')
    })
  })

  const ensureDriveDiscovery = async (topic: Buffer) => {
    if (!swarm) {
      return
    }

    const topicKey = b4a.toString(topic, 'hex')
    let session = driveDiscoverySessions.get(topicKey)

    if (!session) {
      session = swarm.join(topic, { server: true, client: true })
      driveDiscoverySessions.set(topicKey, session)
    }

    await session.flushed()
  }

  await ensureDriveDiscovery(drive.discoveryKey)
  await swarm?.flush()

  log.info({ storeDir: STORE_DIR, driveKey }, 'Cinereel hyper module ready')

  return {
    log,
    store,
    drive,
    swarm,
    driveKey,
    storeDir: STORE_DIR,
    createPeerDrive(key: Buffer) {
      return new Hyperdrive(store, key)
    },
    ensureDriveDiscovery,
    async getDriveDiscoveryCount(topic: Buffer) {
      if (!swarm) {
        return 1
      }

      await ensureDriveDiscovery(topic)
      const discovery = swarm.status(topic) as { _discovered?: Set<string> } | null
      return (discovery?._discovered?.size ?? 0) + 1
    },
    async close() {
      await swarm?.destroy()
      await drive.close()
      await store.close()
    },
  }
}
