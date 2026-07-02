import type Hyperdrive from 'hyperdrive'
import { Injectable } from '@nestjs/common'
import { SwarmService } from '@/modules/base/swarm/swarm.service'

/**
 * FileSwarmService
 *
 * 职责（单一）：以业务语义封装 P2P 网络操作，供上层 Feature Module 使用。
 *   - 启动数据复制（enableReplication）
 *   - 宣告本地 drive 到 P2P 网络（announce）
 *   - 挂载对等节点的 drive（mountPeer）
 *   - 卸载对等节点的 drive（unmountPeer）
 *   - 获取本地 drive 公钥（localPublicKey）
 *
 * 本服务不包含任何文件读写逻辑；所有底层 P2P 操作均委托给 SwarmService。
 *
 * 典型双进程测试场景：
 *   - 进程 A：调用 enableReplication() + announce()，然后用 FileUploadService 上传文件。
 *   - 进程 B：调用 enableReplication() + mountPeer(A 的 publicKey)，
 *             再将返回的 remoteDrive 传给 FileDownloadService.listFiles() 进行扫描。
 */
@Injectable()
export class FileSwarmService {
  constructor(private readonly driveSwarm: SwarmService) {}

  // ---------------------------------------------------------------------------
  // 复制通道
  // ---------------------------------------------------------------------------

  /**
   * 启动 P2P 数据复制：将 Hyperswarm 连接与 Corestore 复制协议绑定。
   * 应在应用就绪后、开始上传或挂载远端 drive 之前调用一次。
   */
  enableReplication(): void {
    this.driveSwarm.enableReplication()
  }

  // ---------------------------------------------------------------------------
  // 本地 Drive 宣告
  // ---------------------------------------------------------------------------

  /**
   * 将本地 drive 宣告到 DHT，使其他节点可以发现并连接。
   * 进程 A（文件提供方）必须在上传文件前调用此方法。
   *
   * @param flush 是否等待宣告完全扩散（默认 true）
   */
  async announce(flush = true): Promise<void> {
    await this.driveSwarm.announce(flush)
  }

  // ---------------------------------------------------------------------------
  // 远端 Drive 挂载
  // ---------------------------------------------------------------------------

  /**
   * 挂载对等节点（进程 A）的 drive，返回可直接传入 FileDownloadService 的实例。
   *
   * 内部会自动等待 DHT 扩散、P2P 连接建立、远端版本同步，
   * 调用方拿到返回值后可立即执行 listFiles / download。
   *
   * @param publicKeyHex 对等节点 drive 公钥（64 位十六进制字符串）
   * @returns 已就绪的远端 Hyperdrive 实例
   */
  async mountPeer(publicKeyHex: string): Promise<Hyperdrive> {
    return this.driveSwarm.mountRemoteDrive(publicKeyHex)
  }

  /**
   * 卸载已挂载的对等节点 drive，释放底层资源。
   *
   * @param publicKeyHex 要卸载的对等节点 drive 公钥
   */
  async unmountPeer(publicKeyHex: string): Promise<void> {
    await this.driveSwarm.unmountRemoteDrive(publicKeyHex)
  }

  // ---------------------------------------------------------------------------
  // 只读访问器
  // ---------------------------------------------------------------------------

  /**
   * 本地 drive 的公钥（十六进制字符串）。
   * 进程 A 应通过某种信道（如 HTTP API、日志输出）将此值告知进程 B。
   */
  get localPublicKey(): string {
    return this.driveSwarm.localPublicKey
  }
}
