import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import { Injectable, Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { HYPER_MODULE_CONFIG, HyperModuleConfig } from './hyper.types'

/**
 * HyperService
 *
 * 职责（单一）：管理 Hypercore 基础设施实例的生命周期。
 *   - 在模块初始化时创建并 ready Corestore / 主 Hyperdrive / Hyperswarm
 *   - 支持通过 namespace 创建并管理多个本地 Hyperdrive 实例
 *   - 在模块销毁时按序关闭所有本地 Drive → Hyperswarm → Corestore
 *   - 对外暴露底层实例访问器，供上层服务注入使用
 *
 * 不包含任何业务逻辑，也不直接处理文件读写。
 */
@Injectable()
export class HyperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HyperService.name)

  private _store!: Corestore
  private _drive!: Hyperdrive
  private _swarm!: Hyperswarm

  /**
   * 额外本地 Drive 实例池（主 Drive 不在此 Map 中）。
   * key = namespace 字符串（UUID v4）。
   */
  private readonly _localDrives = new Map<string, Hyperdrive>()

  constructor(
    @Inject(HYPER_MODULE_CONFIG)
    private readonly config: HyperModuleConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // 生命周期钩子
  // ---------------------------------------------------------------------------

  /**
   * 模块初始化：按顺序创建并就绪所有 Hypercore 实例。
   * NestJS 在所有 provider 完成依赖注入后调用此钩子。
   */
  async onModuleInit(): Promise<void> {
    this.logger.log(`初始化 Corestore → ${this.config.storeDir}`)

    this._store = new Corestore(this.config.storeDir)
    this._drive = new Hyperdrive(this._store)
    this._swarm = new Hyperswarm({
      ...(this.config.swarmPort !== undefined ? { port: this.config.swarmPort } : {}),
      ...(this.config.dhtBootstrap?.length ? { bootstrap: this.config.dhtBootstrap } : {}),
    })

    await this._drive.ready()

    this.logger.log(
      `Hyperdrive 已就绪，公钥: ${this._drive.key?.toString('hex') ?? '(未知)'}`,
    )
  }

  /**
   * 模块销毁：按顺序关闭所有 Hypercore 实例，确保数据刷盘。
   * NestJS 在应用关闭时调用此钩子（需启用 app.enableShutdownHooks()）。
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('正在关闭 Hypercore 传输层...')

    // 先关闭所有额外本地 Drive
    for (const [ns, drive] of this._localDrives) {
      await drive.close().catch((err: unknown) => {
        this.logger.warn(`关闭本地 Drive [namespace=${ns}] 时出错: ${String(err)}`)
      })
    }
    this._localDrives.clear()

    await this._swarm.destroy().catch((err: unknown) => {
      this.logger.warn(`关闭 Hyperswarm 时出错: ${String(err)}`)
    })

    await this._drive.close().catch((err: unknown) => {
      this.logger.warn(`关闭 Hyperdrive 时出错: ${String(err)}`)
    })

    await this._store.close().catch((err: unknown) => {
      this.logger.warn(`关闭 Corestore 时出错: ${String(err)}`)
    })

    this.logger.log('Hypercore 传输层已关闭')
  }

  // ---------------------------------------------------------------------------
  // 多本地 Drive 管理
  // ---------------------------------------------------------------------------

  /**
   * 通过命名空间派生一个新的本地 Hyperdrive 实例并就绪。
   * 若同名 namespace 已存在，直接返回已有实例（幂等）。
   *
   * @param namespace 唯一命名空间字符串（推荐使用 UUID v4）
   * @returns 已 ready() 的 Hyperdrive 实例
   */
  async createLocalDrive(namespace: string): Promise<Hyperdrive> {
    const existing = this._localDrives.get(namespace)
    if (existing) {
      this.logger.debug(`复用已存在的本地 Drive [namespace=${namespace}]`)
      return existing
    }

    const drive = new Hyperdrive(this._store.namespace(namespace))
    await drive.ready()

    this._localDrives.set(namespace, drive)
    this.logger.log(
      `新本地 Drive 已创建 [namespace=${namespace}]，公钥: ${drive.key?.toString('hex') ?? '(未知)'}`,
    )
    return drive
  }

  /**
   * 按 namespace 获取已创建的本地 Drive 实例。
   * 若不存在则返回 undefined。
   *
   * @param namespace 创建时使用的命名空间字符串
   */
  getLocalDrive(namespace: string): Hyperdrive | undefined {
    return this._localDrives.get(namespace)
  }

  /**
   * 返回所有额外本地 Drive 实例的只读视图（不含主 Drive）。
   * key = namespace，value = Hyperdrive 实例。
   */
  getAllLocalDrives(): ReadonlyMap<string, Hyperdrive> {
    return this._localDrives
  }

  // ---------------------------------------------------------------------------
  // 只读访问器 — 供 DriveQueryService / DriveWriteService 注入使用
  // ---------------------------------------------------------------------------

  /**
   * 主本地 Hyperdrive 实例（从 Corestore 默认命名空间派生）。
   */
  get drive(): Hyperdrive {
    return this._drive
  }

  /**
   * 底层 Corestore 实例（用于派生命名空间或创建对等 drive）。
   */
  get store(): Corestore {
    return this._store
  }

  /**
   * Hyperswarm 实例（用于 P2P 节点发现与连接）。
   */
  get swarm(): Hyperswarm {
    return this._swarm
  }

  /**
   * 当前主 drive 的 public key（十六进制字符串）。
   * 用于向对等节点宣告自身身份。
   */
  get driveKey(): string {
    return this._drive.key?.toString('hex') ?? ''
  }
}
