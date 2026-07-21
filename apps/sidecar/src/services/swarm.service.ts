/**
 * SwarmService — drive-keyed swarm operations (announce / peers / mount).
 *
 * CSR layer: services. Business rules around swarm participation:
 *   - `announce(wait)` joins the main drive's discovery topic and (when
 *     `wait=true`) awaits `discovery.flushed()` so the HTTP caller knows
 *     the round-trip finished.
 *   - `mount(publicKey)` / `unmount(publicKey)` drive the sidecar's own
 *     remote-mount bookkeeping: `openRemote` + `registry.rememberRemote`
 *     (mount) and `registry.closeRemote` (unmount).
 *   - `identity()` bundles `sdk.publicKey`, the swarm's bound UDP port,
 *     the main drive's hex key, and the current peer count.
 *
 * Peer connection timestamps are stamped on first sight and cached.
 */
import type { SDK, PeerInfo, IdentityInfo } from '../infrastructure/index.js'
import { MAIN_NAMESPACE } from './drives.service.js'
import { HEX64, toHexKey } from '../infrastructure/types/key.js'
import type { DriveRegistry } from '../bootstrap/drive-registry.js'
import type { DriveRepository } from '../repositories/drive.repository.js'
import type {
  PeerConnectionRepository,
} from '../repositories/peer-connection.repository.js'

export class SwarmService {
  private readonly connectedAt = new Map<string, number>()

  constructor(
    private readonly sdk: SDK,
    private readonly connections: PeerConnectionRepository,
    private readonly drives: DriveRepository,
    private readonly registry: DriveRegistry,
    private readonly mainDriveKey: () => string,
    private readonly resolvedSwarmPort: () => number,
  ) {}

  async announce(wait: boolean = true): Promise<void> {
    // The official SDK's `join` takes a topic (Buffer / string). The main
    // drive's discovery key is what hyperswarm peers actually look up.
    const mainDrive = await this.drives.openLocal(MAIN_NAMESPACE)
    const discovery = this.sdk.join(mainDrive.core.discoveryKey, {
      server: true,
      client: true,
    })
    if (wait) {
      try {
        await discovery.flushed()
      } catch {
        /* the underlying hyperswarm may already have flushed; not fatal */
      }
      // Belt-and-suspenders: also flush the swarm so any in-flight announces
      // are pushed. Matches the historical sidecar behavior.
      try {
        await this.sdk.swarm.flush()
      } catch {
        /* ignore */
      }
    }
  }

  getPeers(): PeerInfo[] {
    const out: PeerInfo[] = []
    for (const conn of this.connections.list()) {
      const pk = conn.remotePublicKey
      if (!pk) continue
      const hex = toHexKey(pk)
      let ts = this.connectedAt.get(hex)
      if (ts === undefined) {
        ts = Date.now()
        this.connectedAt.set(hex, ts)
      }
      out.push({ publicKey: hex, connectedAt: new Date(ts).toISOString() })
    }
    return out
  }

  async mount(publicKey: string): Promise<{ driveKey: string }> {
    if (!HEX64.test(publicKey)) {
      throw new Error(`invalid publicKey: ${publicKey.slice(0, 80)}`)
    }
    const drive = await this.drives.openRemote(publicKey)
    const driveKey = toHexKey(drive.key)
    this.registry.rememberRemote(driveKey, drive)
    return { driveKey }
  }

  async unmount(publicKey: string): Promise<void> {
    if (!HEX64.test(publicKey)) {
      throw new Error(`invalid publicKey: ${publicKey.slice(0, 80)}`)
    }
    await this.registry.closeRemote(publicKey)
  }

  identity(): IdentityInfo {
    const peerPublicKey = toHexKey(this.sdk.publicKey)
    return {
      mainDriveKey: this.mainDriveKey(),
      peerPublicKey,
      swarmPort: this.resolvedSwarmPort(),
      peerCount: this.connections.count(),
    }
  }
}