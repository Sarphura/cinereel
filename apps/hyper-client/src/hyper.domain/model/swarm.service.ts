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
 *     the main drive's hex key (resolved lazily from registry), and the
 *     current peer count.
 */
import { Inject, Injectable } from '@nestjs/common'
import { SDK_TOKEN } from '../../hyper.infrastructure/sdk/sdk.module.js'
import type { SDK, PeerInfo, IdentityInfo, HyperdriveLike } from '../../hyper.infrastructure/types/index.js'
import { MAIN_NAMESPACE } from './drives.service.js'
import { HEX64, toHexKey, driveKeyOf } from '../../hyper.infrastructure/types/key.js'
import { InMemoryDriveRegistry, type DriveRegistry } from './drive-registry.js'
import {
  HyperdriveRepository,
  HyperdriveSwarmRepository,
  type DriveRepository,
  type PeerConnectionRepository,
} from '../interface/drives/index.js'

@Injectable()
export class SwarmService {
  private readonly connectedAt = new Map<string, number>()

  constructor(
    @Inject(SDK_TOKEN) private readonly sdk: SDK,
    @Inject(HyperdriveSwarmRepository) private readonly connections: PeerConnectionRepository,
    @Inject(HyperdriveRepository) private readonly drives: DriveRepository,
    @Inject(InMemoryDriveRegistry) private readonly registry: DriveRegistry,
  ) {}

  async announce(wait: boolean = true): Promise<void> {
    const mainDrive = await this.drives.openLocal(MAIN_NAMESPACE)
    const discoveryKey = Buffer.from(mainDrive.core.discoveryKey)
    const discovery = this.sdk.join(discoveryKey, {
      server: true,
      client: true,
    })
    if (wait) {
      try {
        await discovery.flushed()
      } catch {
        /* the underlying hyperswarm may already have flushed; not fatal */
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

  /**
   * Lazy lookup — main drive may not be mounted at construction time
   * (the bootstrap service mounts it later in onModuleInit). Resolving
   * here means identity() works from the first HTTP request after
   * bootstrap completes.
   */
  private mainDriveKey(): string {
    const main = this.registry.byNamespace(MAIN_NAMESPACE) as HyperdriveLike | null
    return main ? driveKeyOf(main) : ''
  }

  private resolvedSwarmPort(): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dht = (this.sdk.swarm as any).dht as
      | { address?: () => { port: number } }
      | undefined
    if (dht && typeof dht.address === 'function') {
      const addr = dht.address()
      return typeof addr.port === 'number' ? addr.port : 0
    }
    return 0
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
