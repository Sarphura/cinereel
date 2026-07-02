import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common'
import Hyperdrive from 'hyperdrive'
import { HyperService } from '@/modules/base/hyper/hyper.service'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import { DriveRepository } from '../repository/drive.repository'
import type { DriveRecord, CreateDriveDto, UpdateDriveDto, DriveResponseDto } from '../domain/dto/drive.dto'

/**
 * DriveService
 *
 * 职责：Drive 元数据的 CRUD 与文件树查询。
 *
 * - 本地 drive 的创建（从 Corestore 派生新 Hyperdrive 实例）
 * - 元数据的读、写、删（委托 DriveRepository）
 * - 文件树读取（委托 DriveQueryService）
 * - subscribed drive 的元数据记录（由 SubscribedDriveService 调用）
 */
@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name)
  /** 缓存已打开的本地 drives（key = driveKey hex） */
  private readonly localDrives = new Map<string, Hyperdrive>()

  constructor(
    private readonly hyper: HyperService,
    private readonly driveQuery: DriveQueryService,
    private readonly swarm: SwarmService,
    private readonly driveRepo: DriveRepository,
  ) {}

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
    const drive = await this.resolveDrive(driveKey)
    return this.buildTree(drive, '/')
  }

  async refreshTree(driveKey: string): Promise<object> {
    const drive = await this.resolveDrive(driveKey)
    await drive.update().catch(() => {})
    return this.buildTree(drive, '/')
  }

  // ---------------------------------------------------------------------------
  // 本地 Drive 创建
  // ---------------------------------------------------------------------------

  async create(dto: CreateDriveDto): Promise<DriveResponseDto> {
    // 以名称为命名空间从 Corestore 派生一个新的 Hyperdrive
    const namespace = `drive-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const newDrive = new Hyperdrive(this.hyper.store.namespace(namespace))
    await newDrive.ready()

    const driveKey = newDrive.key!.toString('hex')
    this.localDrives.set(driveKey, newDrive)

    // 将本地 drive 宣告到 P2P 网络
    try {
      const discovery = this.hyper.swarm.join(newDrive.discoveryKey)
      await discovery.flushed()
    } catch (err) {
      this.logger.warn(`宣告 Drive 到 DHT 时出错: ${String(err)}`)
    }

    const now = Date.now()
    const record: DriveRecord = {
      id: driveKey,
      name: dto.name,
      type: dto.type,
      isLocal: true,
      createdAt: now,
      updatedAt: now,
    }

    this.driveRepo.save(record)
    this.logger.log(`本地 Drive 已创建: ${driveKey} (${dto.name})`)
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

    // 关闭本地 drive 实例（若已打开）
    const drive = this.localDrives.get(driveKey)
    if (drive) {
      await drive.close().catch(() => {})
      this.localDrives.delete(driveKey)
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
   * 本地 drive：从缓存或重新打开；远端 drive：委托 SwarmService。
   */
  async resolveDrive(driveKey: string): Promise<Hyperdrive> {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)

    if (record.isLocal) {
      const cached = this.localDrives.get(driveKey)
      if (cached) return cached

      // 主 drive（第一个本地 drive）直接用 HyperService.drive
      if (this.hyper.drive.key?.toString('hex') === driveKey) {
        return this.hyper.drive
      }

      // 其他本地 drive：从 Corestore 重新构建（仅 key-based，不命名空间）
      const keyBuffer = Buffer.from(driveKey, 'hex')
      const drive = new Hyperdrive(this.hyper.store.session(), keyBuffer)
      await drive.ready()
      this.localDrives.set(driveKey, drive)
      return drive
    }

    // 远端订阅 drive
    return this.swarm.mountRemoteDrive(driveKey)
  }

  private async buildTree(drive: Hyperdrive, prefix: string): Promise<object> {
    const entries = await this.driveQuery.list(prefix, false, drive)

    // 组织为树形结构
    type TreeNode = {
      path: string
      name: string
      type: 'file' | 'directory'
      size: number
      updatedAt: number
      children?: TreeNode[]
    }

    const nodeMap = new Map<string, TreeNode>()
    const root: TreeNode = {
      path: '/',
      name: '/',
      type: 'directory',
      size: 0,
      updatedAt: 0,
      children: [],
    }
    nodeMap.set('/', root)

    for (const entry of entries) {
      const parts = entry.key.split('/').filter(Boolean)
      let current = root

      for (let i = 0; i < parts.length; i++) {
        const segPath = '/' + parts.slice(0, i + 1).join('/')
        let node = nodeMap.get(segPath)

        if (!node) {
          const isLast = i === parts.length - 1
          node = {
            path: segPath,
            name: parts[i],
            type: isLast ? 'file' : 'directory',
            size: isLast ? (entry.value?.blob?.byteLength ?? 0) : 0,
            updatedAt: isLast ? (entry.value?.metadata?.mtime ?? 0) : 0,
            children: isLast ? undefined : [],
          }
          nodeMap.set(segPath, node)
          current.children = current.children ?? []
          current.children.push(node)
        }

        if (node.type === 'directory') {
          current = node
        }
      }
    }

    return root
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
