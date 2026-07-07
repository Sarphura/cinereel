import { v4 as uuidv4 } from 'uuid'
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, OnModuleInit } from '@nestjs/common'
import type Hyperdrive from 'hyperdrive'
import { HyperService } from '@/modules/base/hyper/hyper.service'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { DriveWriteService } from '@/modules/base/drive/service/drive.write.service'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import { DriveRepository } from '../repository/drive.repository'
import type {
  DriveRecord,
  CreateDriveDto,
  UpdateDriveDto,
  MoveFileDto,
  CopyFileDto,
  CreateFolderDto,
  DeleteFileDto,
  DriveResponseDto,
} from '../domain/dto/drive.dto'
import { buildTreeFromEntries } from '@/modules/common/utils/tree.util'
import {
  DRIVE_FOLDER_MARKER_NAME,
  normalizeDrivePath,
  isRootPath,
  isPathWithin,
  joinDrivePath,
} from '@/modules/common/utils/drive-path.util'

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
    private readonly driveWrite: DriveWriteService,
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
    return this.buildTree(drive, '/', !record.isLocal)
  }

  async refreshTree(driveKey: string): Promise<object> {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)
    const drive = await this.resolveDrive(driveKey)
    await (drive as Hyperdrive & { update(options?: { wait?: boolean }): Promise<boolean> })
      .update({ wait: !record.isLocal })
      .catch(() => {})
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
  // 文件移动（重命名 / 拖拽移动）
  // ---------------------------------------------------------------------------

  /**
   * 将 drive 内的文件或目录从 `from` 路径移动到 `to` 路径。
   *
   * - 文件：get(from) → put(to, buf) → del(from)
   * - 目录：递归遍历子文件，批量 get/put/del
   *
   * 注意：Hyperdrive 无原生 rename，移动会产生新的 blob 块，
   * 订阅者将重新同步被移动的文件内容。
   */
  async moveFile(driveKey: string, dto: MoveFileDto): Promise<void> {
    const record = this.getLocalRecordOrThrow(driveKey)

    const from = normalizeDrivePath(dto.from)
    const to = normalizeDrivePath(dto.to)

    if (isRootPath(from)) throw new BadRequestException('不能移动根目录')
    if (from === to) throw new BadRequestException('源路径与目标路径相同')
    if (isPathWithin(to, from)) throw new BadRequestException('不能将目录移动到其自身子目录中')

    const drive = await this.resolveDrive(record.id)
    const sourceStatus = await this.resolvePathStatus(drive, from)
    if (!sourceStatus.exists) throw new NotFoundException(`源路径不存在: ${from}`)

    const destStatus = await this.resolvePathStatus(drive, to)
    if (destStatus.exists) throw new BadRequestException(`目标路径已存在: ${to}`)

    if (sourceStatus.isDirectory) {
      // 目录：递归移动所有子文件（含空目录占位文件）
      const entries = await this.driveQuery.list(`${from}/`, false, drive)
      for (const entry of entries) {
        const relPath = entry.key.slice(from.length)
        const newPath = to + relPath
        const buf = await drive.get(entry.key, { wait: false })
        if (buf) {
          await this.driveWrite.put(newPath, buf, drive)
          await this.driveWrite.del(entry.key, drive)
        }
      }
    } else {
      // 单文件
      const buf = await drive.get(from, { wait: false })
      if (!buf) throw new NotFoundException(`文件不存在或无法读取: ${from}`)
      await this.driveWrite.put(to, buf, drive)
      await this.driveWrite.del(from, drive)
    }

    this.logger.log(`文件移动完成: ${from} → ${to} [drive=${driveKey}]`)
  }

  // ---------------------------------------------------------------------------
  // 文件复制
  // ---------------------------------------------------------------------------

  /**
   * 将 drive 内的文件或目录从 `from` 复制到 `to`，源文件保留不变。
   * 与 moveFile 的区别仅在于不执行 del 步骤。
   */
  async copyFile(driveKey: string, dto: CopyFileDto): Promise<void> {
    const record = this.getLocalRecordOrThrow(driveKey)

    const from = normalizeDrivePath(dto.from)
    const to = normalizeDrivePath(dto.to)

    if (isRootPath(from)) throw new BadRequestException('不能复制根目录')
    if (from === to) throw new BadRequestException('源路径与目标路径相同')
    if (isPathWithin(to, from)) throw new BadRequestException('不能将目录复制到其自身子目录中')

    const drive = await this.resolveDrive(record.id)
    const sourceStatus = await this.resolvePathStatus(drive, from)
    if (!sourceStatus.exists) throw new NotFoundException(`源路径不存在: ${from}`)

    const destStatus = await this.resolvePathStatus(drive, to)
    if (destStatus.exists) throw new BadRequestException(`目标路径已存在: ${to}`)

    if (sourceStatus.isDirectory) {
      const entries = await this.driveQuery.list(`${from}/`, false, drive)
      for (const entry of entries) {
        const relPath = entry.key.slice(from.length)
        const newPath = to + relPath
        const buf = await drive.get(entry.key, { wait: false })
        if (buf) {
          await this.driveWrite.put(newPath, buf, drive)
        }
      }
    } else {
      const buf = await drive.get(from, { wait: false })
      if (!buf) throw new NotFoundException(`文件不存在或无法读取: ${from}`)
      await this.driveWrite.put(to, buf, drive)
    }

    this.logger.log(`文件复制完成: ${from} → ${to} [drive=${driveKey}]`)
  }

  // ---------------------------------------------------------------------------
  // 目录创建
  // ---------------------------------------------------------------------------

  /**
   * 在 drive 内创建一个空目录。
   *
   * Hyperdrive 没有原生目录概念，因此通过写入一个隐藏占位文件
   * （DRIVE_FOLDER_MARKER_NAME）使该目录在文件树中持久可见，
   * 占位文件本身会在 buildTreeFromEntries 中被过滤，不对用户可见。
   */
  async createFolder(driveKey: string, dto: CreateFolderDto): Promise<void> {
    const record = this.getLocalRecordOrThrow(driveKey)

    const path = normalizeDrivePath(dto.path)
    if (isRootPath(path)) throw new BadRequestException('不能创建根目录')

    const drive = await this.resolveDrive(record.id)
    const status = await this.resolvePathStatus(drive, path)
    if (status.exists) throw new BadRequestException(`路径已存在: ${path}`)

    const markerPath = joinDrivePath(path, DRIVE_FOLDER_MARKER_NAME)
    await this.driveWrite.put(markerPath, Buffer.alloc(0), drive)
    this.logger.log(`目录已创建: ${path} [drive=${driveKey}]`)
  }

  // ---------------------------------------------------------------------------
  // 文件删除
  // ---------------------------------------------------------------------------

  /**
   * 删除 drive 内指定路径的文件或目录（含其所有子内容）。
   */
  async deleteFile(driveKey: string, dto: DeleteFileDto): Promise<void> {
    const record = this.getLocalRecordOrThrow(driveKey)

    const path = normalizeDrivePath(dto.path)
    if (isRootPath(path)) throw new BadRequestException('不能删除根目录')

    const drive = await this.resolveDrive(record.id)
    const status = await this.resolvePathStatus(drive, path)
    if (!status.exists) throw new NotFoundException(`路径不存在: ${path}`)

    await this.driveWrite.delTree(path, drive)
    this.logger.log(`已删除: ${path} [drive=${driveKey}]`)
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
   * 查找 driveKey 对应的记录，并确保其为本地 owned drive。
   * 文件写操作（创建/删除/移动/复制）仅允许作用于本地 drive。
   */
  private getLocalRecordOrThrow(driveKey: string): DriveRecord {
    const record = this.driveRepo.findById(driveKey)
    if (!record) throw new NotFoundException(`Drive 不存在: ${driveKey}`)
    if (!record.isLocal) throw new ForbiddenException('该操作仅支持本地 Drive')
    return record
  }

  /**
   * 判断路径在 drive 中的存在状态与类型。
   *
   * 通过 `${path}/` 前缀列举子条目判断是否为目录，避免 `/foo` 前缀
   * 误匹配 `/foobar` 等同名前缀路径；若无子条目再检查是否为单个文件条目。
   */
  private async resolvePathStatus(
    drive: Hyperdrive,
    path: string,
  ): Promise<{ exists: boolean; isDirectory: boolean }> {
    const childEntries = await this.driveQuery.list(`${path}/`, false, drive)
    if (childEntries.length > 0) {
      return { exists: true, isDirectory: true }
    }

    const entry = await this.driveQuery.getEntry(path, false, drive)
    if (entry) {
      return { exists: true, isDirectory: false }
    }

    return { exists: false, isDirectory: false }
  }

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
