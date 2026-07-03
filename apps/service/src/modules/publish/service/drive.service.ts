import { v4 as uuidv4 } from 'uuid'
import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common'
import type Hyperdrive from 'hyperdrive'
import { HyperService } from '@/modules/base/hyper/hyper.service'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import { DriveRepository } from '../repository/drive.repository'
import type { DriveRecord, CreateDriveDto, UpdateDriveDto, DriveResponseDto } from '../domain/dto/drive.dto'
import { buildTreeFromEntries } from '@/modules/common/utils/tree.util'

/**
 * DriveService
 *
 * 职责：Drive 元数据的 CRUD 与文件树查询。
 *
 * - 本地 drive 的创建（委托 HyperService.createLocalDrive 以 namespace 派生）
 * - 元数据的读、写、删（委托 DriveRepository）
 * - 文件树读取（委托 DriveQueryService）
 * - subscribed drive 的元数据记录（由 SubscribedDriveService 调用）
 * - 应用启动时从 DriveRepository 恢复所有本地 Drive 实例
 */
@Injectable()
export class DriveService implements OnModuleInit {
  private readonly logger = new Logger(DriveService.name)

  constructor(
    private readonly hyper: HyperService,
    private readonly driveQuery: DriveQueryService,
    private readonly swarm: SwarmService,
    private readonly driveRepo: DriveRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // 生命周期：启动恢复
  // ---------------------------------------------------------------------------

  /**
   * 应用启动时，从 DriveRepository 读取所有本地 Drive 记录，
   * 并通过 HyperService.createLocalDrive 重新 ready() 对应实例，
   * 确保重启后已创建的本地 Drive 可以立即被使用。
   */
  async onModuleInit(): Promise<void> {
    const localRecords = this.driveRepo.findAllLocal()
    let restored = 0

    for (const record of localRecords) {
      // 主 Drive（无 namespace）由 HyperService 自动管理，无需恢复
      if (!record.namespace) continue

      try {
        await this.hyper.createLocalDrive(record.namespace)
        restored++
        this.logger.debug(`恢复本地 Drive [namespace=${record.namespace}]，driveKey: ${record.id}`)
      } catch (err) {
        this.logger.warn(`恢复本地 Drive 失败 [namespace=${record.namespace}]: ${String(err)}`)
      }
    }

    if (restored > 0) {
      this.logger.log(`已恢复 ${restored} 个本地 Drive 实例`)
    }
  }

  // ---------------------------------------------------------------------------
  // 查询
  // ---------------------------------------------------------------------------

  async listAll(): Promise<DriveResponseDto[]> {
    const records = this.driveRepo.findAll()
    return Promise.all(records.map((r) => this.toResponseDto(r)))
  }

  async getOne(driveKey: string): Promise<DriveResponseDto> {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)
    return this.toResponseDto(record)
  }

  // ---------------------------------------------------------------------------
  // 文件树
  // ---------------------------------------------------------------------------

  async getTree(driveKey: string): Promise<object> {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)
    const drive = await this.resolveDrive(driveKey)
    if (!record.isLocal) {
      // 必须先有活跃连接再 update，否则 update() 立即 resolve 返回空
      await this.waitForPeer(8000)
      await drive.update().catch(() => {})
    }
    return this.buildTree(drive, '/', !record.isLocal)
  }

  async refreshTree(driveKey: string): Promise<object> {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)
    const drive = await this.resolveDrive(driveKey)
    await this.waitForPeer(5000)
    await drive.update().catch(() => {})
    return this.buildTree(drive, '/', !record.isLocal)
  }

  // ---------------------------------------------------------------------------
  // 本地 Drive 创建
  // ---------------------------------------------------------------------------

  async create(dto: CreateDriveDto): Promise<DriveResponseDto> {
    // 生成 UUID 作为 namespace，确保唯一性且重启后可重现
    const namespace = uuidv4()

    // 委托 HyperService 通过命名空间派生并管理新 Drive 的生命周期
    const newDrive = await this.hyper.createLocalDrive(namespace)
    const driveKey = newDrive.key!.toString('hex')

    // 将本地 drive 宣告到 P2P 网络
    try {
      await this.swarm.announceLocalDrive(newDrive)
    } catch (err) {
      this.logger.warn(`宣告 Drive 到 DHT 时出错: ${String(err)}`)
    }

    const now = Date.now()
    const record: DriveRecord = {
      id: driveKey,
      name: dto.name,
      type: dto.type,
      isLocal: true,
      namespace,
      createdAt: now,
      updatedAt: now,
    }

    this.driveRepo.save(record)
    this.logger.log(`本地 Drive 已创建: ${driveKey} (${dto.name}) [namespace=${namespace}]`)
    return this.toResponseDto(record)
  }

  // ---------------------------------------------------------------------------
  // 更新（rename / remark）
  // ---------------------------------------------------------------------------

  async update(driveKey: string, dto: UpdateDriveDto): Promise<DriveResponseDto> {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)

    if (dto.name !== undefined) record.name = dto.name
    if (dto.remark !== undefined) record.remark = dto.remark === null ? undefined : dto.remark
    record.updatedAt = Date.now()

    this.driveRepo.save(record)
    return this.toResponseDto(record)
  }

  // ---------------------------------------------------------------------------
  // 删除
  // ---------------------------------------------------------------------------

  async delete(driveKey: string): Promise<void> {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)

    // 若有 namespace，从 HyperService 的 localDrives 中关闭对应实例
    if (record.namespace) {
      const drive = this.hyper.getLocalDrive(record.namespace)
      if (drive) {
        await drive.close().catch(() => {})
      }
    }

    this.driveRepo.delete(driveKey)
    this.logger.log(`Drive 已删除: ${driveKey}`)
  }

  // ---------------------------------------------------------------------------
  // 内部：供 SubscribedDriveService 调用，保存非本地 drive 元数据
  // ---------------------------------------------------------------------------

  saveRecord(record: DriveRecord): DriveRecord {
    return this.driveRepo.save(record)
  }

  deleteRecord(driveKey: string): boolean {
    return this.driveRepo.delete(driveKey)
  }

  findRecord(driveKey: string): DriveRecord | null {
    return this.driveRepo.findById(driveKey)
  }

  // ---------------------------------------------------------------------------
  // 私有工具
  // ---------------------------------------------------------------------------

  /**
   * 解析指定 driveKey 对应的 Hyperdrive 实例。
   * 本地 drive：主 Drive 直接返回；其余按 namespace 从 HyperService 缓存取。
   * 远端 drive：委托 SwarmService。
   */
  async resolveDrive(driveKey: string): Promise<Hyperdrive> {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)

    if (record.isLocal) {
      // 主 Drive（无 namespace）
      if (this.hyper.drive.key?.toString('hex') === driveKey) {
        return this.hyper.drive
      }

      // 其他本地 Drive：必须有 namespace，从 HyperService 缓存取，若未命中则重新创建
      if (!record.namespace) {
        throw new NotFoundException(`本地 Drive 数据不完整，缺少 namespace: ${driveKey}`)
      }

      const cached = this.hyper.getLocalDrive(record.namespace)
      if (cached) return cached

      // 恢复未命中的 Drive（极少情况，例如缓存丢失）
      return this.hyper.createLocalDrive(record.namespace)
    }

    // 远端订阅 drive
    return this.swarm.mountRemoteDrive(driveKey)
  }

  /**
   * 等待 Hyperswarm 至少建立一个活跃连接，最多等待 timeoutMs。
   * 运行时已有连接则立即返回。
   */
  private waitForPeer(timeoutMs: number): Promise<void> {
    if (this.hyper.swarm.connections.size > 0) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs)
      const onConn = () => {
        clearTimeout(timer)
        this.hyper.swarm.off('connection', onConn)
        resolve()
      }
      this.hyper.swarm.once('connection', onConn)
    })
  }

  private async buildTree(drive: Hyperdrive, prefix: string, wait = false): Promise<object> {
    const entries = await this.driveQuery.list(prefix, wait, drive)
    return buildTreeFromEntries(entries as any)
  }

  private toResponseDto(record: DriveRecord): DriveResponseDto {
    return {
      driveKey: record.id,
      name: record.name,
      type: record.type,
      remark: record.remark,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      fileCount: 0,
      totalSize: 0,
      publicationCount: 0,
      peerCount: this.hyper.swarm.connections.size,
      isLocal: record.isLocal,
    }
  }
}
