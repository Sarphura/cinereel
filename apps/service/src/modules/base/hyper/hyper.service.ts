import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import { Injectable, Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { HYPER_MODULE_CONFIG, HyperModuleConfig } from './hyper.types'

/**
 * HyperService
 *
 * 职责（单一）：管理 Hypercore 基础设施实例的生命周期。
 *   - 在模块初始化时创建并 ready Corestore / Hyperdrive
 *   - 在模块销毁时按序关闭 Hyperswarm → Hyperdrive → Corestore
 *   - 对外暴露三个只读访问器，供上层服务注入使用
 *
 * 不包含任何业务逻辑，也不直接处理文件读写。
 */
@Injectable()
export class HyperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HyperService.name)

  private _store!: Corestore
  private _drive!: Hyperdrive
  private _swarm!: Hyperswarm

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
    this._swarm = new Hyperswarm()

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
  // 只读访问器 — 供 DriveQueryService / DriveWriteService 注入使用
  // ---------------------------------------------------------------------------

  /**
   * 本地 Hyperdrive 实例（写入驱动）。
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
   * 当前本地 drive 的 public key（十六进制字符串）。
   * 用于向对等节点宣告自身身份。
   */
  get driveKey(): string {
    return this._drive.key?.toString('hex') ?? ''
  }
}
