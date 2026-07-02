import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { DriveService } from '@/modules/publish/service/drive.service'
import type { DriveRecord } from '@/modules/publish/domain/dto/drive.dto'
import type { SubscribedDriveResponseDto } from '../domain/dto/subscribed-drive.dto'

/**
 * SubscribedDriveService
 *
 * 职责：管理远端订阅 Drive 的接入与元数据。
 *
 * 订阅流程：
 * 1. 通过 SwarmService 挂载远端 Drive（P2P 连接 + 同步）
 * 2. 从 `descriptor.json` 读取 name / type（若有）
 * 3. 将元数据写入 DriveService（复用 DriveRepository）
 *
 * 取消订阅：
 * 1. 卸载远端 Drive 实例
 * 2. 从元数据存储中删除记录
 */
@Injectable()
export class SubscribedDriveService {
  private readonly logger = new Logger(SubscribedDriveService.name)

  constructor(
    private readonly swarm: SwarmService,
    private readonly driveQuery: DriveQueryService,
    private readonly driveService: DriveService,
  ) {}

  // ---------------------------------------------------------------------------
  // 添加订阅
  // ---------------------------------------------------------------------------

  async add(driveKey: string): Promise<SubscribedDriveResponseDto> {
    // 幂等：若已存在则直接返回
    const existing = this.driveService.findRecord(driveKey)
    if (existing) {
      return {
        driveKey: existing.id,
        name: existing.name,
        type: existing.type,
        createdAt: existing.createdAt,
      }
    }

    this.logger.log(`正在挂载远端 Drive: ${driveKey}`)
    const remoteDrive = await this.swarm.mountRemoteDrive(driveKey)

    // 尝试读取远端 descriptor.json 获取元数据
    type Descriptor = { name?: string; type?: string }
    const descriptor = await this.driveQuery.getJson<Descriptor>(
      '/descriptor.json',
      false,
      remoteDrive,
    ).catch(() => null)

    const name = descriptor?.name?.trim() || `Drive ${driveKey.slice(0, 8)}`
    const type = (descriptor?.type as DriveRecord['type']) ?? 'generic'
    const now = Date.now()

    const record: DriveRecord = {
      id: driveKey,
      name,
      type,
      isLocal: false,
      createdAt: now,
      updatedAt: now,
    }

    this.driveService.saveRecord(record)
    this.logger.log(`订阅成功: ${driveKey} (${name})`)

    return { driveKey, name, type, createdAt: now }
  }

  // ---------------------------------------------------------------------------
  // 取消订阅
  // ---------------------------------------------------------------------------

  async remove(driveKey: string): Promise<void> {
    const record = this.driveService.findRecord(driveKey)
    if (!record || record.isLocal) {
      throw new NotFoundException(`订阅的 Drive 不存在: ${driveKey}`)
    }

    await this.swarm.unmountRemoteDrive(driveKey)
    this.driveService.deleteRecord(driveKey)
    this.logger.log(`取消订阅: ${driveKey}`)
  }

  // ---------------------------------------------------------------------------
  // 更新备注
  // ---------------------------------------------------------------------------

  async updateRemark(driveKey: string, remark: string | null | undefined): Promise<{ driveKey: string; remark?: string }> {
    const record = this.driveService.findRecord(driveKey)
    if (!record || record.isLocal) {
      throw new NotFoundException(`订阅的 Drive 不存在: ${driveKey}`)
    }

    record.remark = remark === null || remark === undefined ? undefined : remark
    record.updatedAt = Date.now()
    this.driveService.saveRecord(record)

    return { driveKey, remark: record.remark }
  }
}
