import Hyperdrive from 'hyperdrive'
import { Injectable, Logger } from '@nestjs/common'
import { HyperService } from '@/modules/base/hyper/hyper.service'

/**
 * SwarmService
 *
 * 职责（单一）：管理 Hyperswarm P2P 网络层，
 * 将底层 Hypercore 数据复制协议与网络连接绑定。
 *   - 启动数据复制（将 Corestore 的复制流与 Swarm 连接绑定）
 *   - 宣告本地 drive 到 DHT 网络（join + announce）
 *   - 挂载远端 drive（根据对等节点 publicKey 构造只读实例）
 *   - 加入远端 drive 的发现通道（以便找到数据提供方）
 *
 * 本服务不包含任何文件读写逻辑；
 * 所有底层实例均由 HyperService 持有和管理生命周期。
 */
@Injectable()
export class SwarmService {
  private readonly logger = new Logger(SwarmService.name)

  /** 记录已挂载的远端 drive，避免重复创建实例。key 为 hex 公钥。 */
  private readonly remoteDrives = new Map<string, Hyperdrive>()

  constructor(private readonly hyper: HyperService) {}

  // ---------------------------------------------------------------------------
  // 复制通道绑定
  // ---------------------------------------------------------------------------

  /**
   * 启动数据复制：监听 Hyperswarm 连接事件，将新建立的 TCP/UTP 连接
   * 传递给 Corestore 的复制协议。
   *
   * 调用时机：通常在 NestJS 模块初始化完成后，应用进入就绪态之前调用一次。
   * 若已调用过则幂等（Hyperswarm 本身不会重复绑定同一 listener）。
   */
  enableReplication(): void {
    this.hyper.swarm.on('connection', (conn) => {
      this.logger.debug('新的 P2P 连接建立，开始复制数据流')
      this.hyper.store.replicate(conn)
    })

    this.logger.log('P2P 数据复制通道已启用')
  }

  // ---------------------------------------------------------------------------
  // 本地 Drive 宣告
  // ---------------------------------------------------------------------------

  /**
   * 将本地 Hyperdrive 的 discoveryKey 宣告到 DHT 网络，
   * 使其他节点能够发现并连接到本节点。
   *
   * @param flush 是否等待宣告在 DHT 上完成扩散（默认 true）。
   *              生产环境建议 true 以确保宣告可靠；测试时可设为 false。
   */
  async announce(flush = true): Promise<void> {
    const discovery = this.hyper.swarm.join(this.hyper.drive.discoveryKey)

    if (flush) {
      await discovery.flushed()
    }

    this.logger.log(
      `本地 Drive 已宣告到 DHT，discoveryKey: ${this.hyper.drive.discoveryKey.toString('hex')}`,
    )
  }

  // ---------------------------------------------------------------------------
  // 挂载远端 Drive
  // ---------------------------------------------------------------------------

  /**
   * 根据对等节点的 publicKey（十六进制字符串）构造并返回一个只读 Hyperdrive 实例。
   *
   * 若该公钥对应的 drive 已经挂载过，则返回缓存实例，不会重复创建。
   * 内部会自动：① 等待 DHT 宣告扩散完成 ② 等待首个 P2P 连接建立 ③ 同步远端版本。
   *
   * @param publicKeyHex 对等节点 Hyperdrive 的公钥（64 位十六进制字符串）
   * @returns 已就绪并完成首次同步的远端 Hyperdrive 实例（只读）
   */
  async mountRemoteDrive(publicKeyHex: string): Promise<Hyperdrive> {
    const cached = this.remoteDrives.get(publicKeyHex)
    if (cached) {
      this.logger.debug(`返回缓存的远端 Drive, publicKey: ${publicKeyHex}`)
      return cached
    }

    const keyBuffer = Buffer.from(publicKeyHex, 'hex')

    // 【关键修复】：必须使用 session() 派生一个新的 Corestore 会话。
    // 因为当 Hyperdrive 实例被 .close() 卸载时，它会自动关闭构造时传入的 corestore。
    // 如果直接传入全局主 store (this.hyper.store)，会导致整个应用的主 store 被意外关闭，
    // 进而使后续所有的读写操作都抛出 "Error: Corestore is closed"。
    const session = this.hyper.store.session()
    const remoteDrive = new Hyperdrive(session, keyBuffer)
    await remoteDrive.ready()

    // 加入远端 drive 的发现通道，驱动 Swarm 主动寻找数据提供方
    const discovery = this.hyper.swarm.join(remoteDrive.discoveryKey)

    // 始终等待 DHT 宣告扩散完成，确保其他节点能发现我们
    await discovery.flushed()

    // 等待至少一个 P2P 连接建立后，再等远端 drive 同步最新版本。
    // 若已有活跃连接（重复挂载场景）则跳过等待。
    const hasPeer = this.hyper.swarm.connections.size > 0
    if (!hasPeer) {
      await new Promise<void>((resolve) => {
        const onConnection = () => {
          this.hyper.swarm.off('connection', onConnection)
          resolve()
        }
        this.hyper.swarm.once('connection', onConnection)
      })
    }

    // 等待远端 drive 推送最新版本（至少一次 update）
    await remoteDrive.update().catch(() => {})

    this.remoteDrives.set(publicKeyHex, remoteDrive)

    this.logger.log(`远端 Drive 挂载完成，publicKey: ${publicKeyHex}`)
    return remoteDrive
  }

  // ---------------------------------------------------------------------------
  // 取消挂载远端 Drive
  // ---------------------------------------------------------------------------

  /**
   * 关闭并从缓存中移除指定远端 drive 实例。
   * 不会影响本地 drive 或其他已挂载的远端 drive。
   *
   * @param publicKeyHex 要取消挂载的远端 drive 公钥（十六进制字符串）
   */
  async unmountRemoteDrive(publicKeyHex: string): Promise<void> {
    const drive = this.remoteDrives.get(publicKeyHex)
    if (!drive) {
      return
    }

    await drive.close().catch((err: unknown) => {
      this.logger.warn(`关闭远端 Drive 时出错 [${publicKeyHex}]: ${String(err)}`)
    })

    this.remoteDrives.delete(publicKeyHex)
    this.logger.log(`远端 Drive 已卸载，publicKey: ${publicKeyHex}`)
  }

  // ---------------------------------------------------------------------------
  // 只读访问器
  // ---------------------------------------------------------------------------

  /**
   * 返回当前本地 drive 的 publicKey 十六进制字符串。
   * 供调用方广播给其他节点使用。
   */
  get localPublicKey(): string {
    return this.hyper.driveKey
  }
}
