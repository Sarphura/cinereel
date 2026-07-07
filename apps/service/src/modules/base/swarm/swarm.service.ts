import Hyperdrive from 'hyperdrive'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { HyperService } from '@/modules/base/hyper/hyper.service'

/**
 * SwarmService
 *
 * 职责（单一）：管理 Hyperswarm P2P 网络层，
 * 将底层 Hypercore 数据复制协议与网络连接绑定。
 *   - 启动数据复制（将 Corestore 的复制流与 Swarm 连接绑定）
 *   - 宣告本地 drive 到 DHT 网络（join + announce）
 *   - 批量宣告所有本地 drive
 *   - 挂载远端 drive（根据对等节点 publicKey 构造只读实例）
 *
 * 本服务不包含任何文件读写逻辑；
 * 所有底层实例均由 HyperService 持有和管理生命周期。
 */
@Injectable()
export class SwarmService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SwarmService.name)

  /** 记录已挂载的远端 drive，避免重复创建实例。key 为 hex 公钥。 */
  private readonly remoteDrives = new Map<string, Hyperdrive>()

  private replicationEnabled = false

  constructor(private readonly hyper: HyperService) {}

  async onApplicationBootstrap(): Promise<void> {
    this.enableReplication()

    void this.announceAll().catch((err: unknown) => {
      this.logger.warn(`启动时宣告本地 Drive 失败: ${String(err)}`)
    })
  }

  /**
   * 将 Hyperswarm 连接绑定到 Corestore 复制协议。
   * Corestore 会自动复制其下所有已打开的 core（含 session 中的远端 drive）。
   */
  enableReplication(): void {
    if (this.replicationEnabled) {
      return
    }

    this.replicationEnabled = true

    this.hyper.swarm.on('connection', (conn) => {
      this.logger.log(`新的 P2P 连接建立 (active=${this.hyper.swarm.connections.size})`)
      this.hyper.store.replicate(conn)
    })

    this.logger.log('P2P 数据复制通道已启用')
  }

  async announceLocalDrive(drive: Hyperdrive, flush = true): Promise<void> {
    // 发布方仅作为 server：双方都 server+client 时 Hyperswarm 会因去重而放弃互连。
    const discovery = this.hyper.swarm.join(drive.discoveryKey, {
      server: true,
      client: false,
    })

    if (flush) {
      await discovery.flushed()
    }

    this.logger.log(
      `Local drive has been announced to DHT, discoveryKey: ${drive.discoveryKey.toString('hex')}`,
    )
  }

  async announce(flush = true): Promise<void> {
    return this.announceLocalDrive(this.hyper.drive, flush)
  }

  async announceAll(flush = true): Promise<void> {
    await this.announceLocalDrive(this.hyper.drive, flush)

    for (const drive of this.hyper.getAllLocalDrives().values()) {
      await this.announceLocalDrive(drive, flush)
    }
  }

  async mountRemoteDrive(publicKeyHex: string): Promise<Hyperdrive> {
    const cached = this.remoteDrives.get(publicKeyHex)
    if (cached) {
      this.logger.debug(`Return remote cached drive, publicKey: ${publicKeyHex}`)
      return cached
    }

    const session = this.hyper.store.session()
    const remoteDrive = new Hyperdrive(session, Buffer.from(publicKeyHex, 'hex'))
    await remoteDrive.ready()

    this.remoteDrives.set(publicKeyHex, remoteDrive)

    const swarmDrive = remoteDrive as Hyperdrive & {
      findingPeers(): () => void
      update(options?: { wait?: boolean }): Promise<boolean>
    }
    const doneFindingPeers = swarmDrive.findingPeers()
    try {
      // 订阅方仅作为 client 连接数据提供方。
      this.hyper.swarm.join(remoteDrive.discoveryKey, {
        server: false,
        client: true,
      })
      await this.hyper.swarm.flush()
    } finally {
      doneFindingPeers()
    }

    await swarmDrive.update({ wait: true }).catch(() => {})

    this.logger.log(
      `Remote drive mounted successfully, publicKey: ${publicKeyHex}, peers=${this.hyper.swarm.connections.size}`,
    )
    return remoteDrive
  }

  async unmountRemoteDrive(publicKeyHex: string): Promise<void> {
    const drive = this.remoteDrives.get(publicKeyHex)
    if (!drive) {
      return
    }

    await drive.close().catch((err: unknown) => {
      this.logger.warn(`Failed when close remote drive: [${publicKeyHex}]: ${String(err)}`)
    })

    this.remoteDrives.delete(publicKeyHex)
    this.logger.log(`Unmounted remote drive successfully, publicKey: ${publicKeyHex}`)
  }

  get localPublicKey(): string {
    return this.hyper.driveKey
  }

  get localPublicKeys(): string[] {
    const keys: string[] = [this.hyper.driveKey]

    for (const drive of this.hyper.getAllLocalDrives().values()) {
      const key = drive.key?.toString('hex')
      if (key) {
        keys.push(key)
      }
    }

    return keys
  }
}
