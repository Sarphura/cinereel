import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type Hyperdrive from 'hyperdrive'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { DriveService } from '@/modules/publish/service/drive.service'
import { ProfileService } from '@/modules/profile/service/profile.service'
import {
  DRIVE_DESCRIPTOR_PATH,
  type DriveContentType,
  type DriveDescriptor,
} from '@/modules/common/domain/drive-manifest'
import {
  isDrivePublicKey,
  readDriveJsonWithRetry,
} from '@/modules/common/utils/drive-json.util'
import type { DriveRecord } from '@/modules/publish/domain/dto/drive.dto'
import type { SubscribeResponseDto } from '../domain/dto/subscribe.dto'

const DRIVE_CONTENT_TYPES = new Set<DriveContentType>([
  'movie',
  'series',
  'music',
  'generic',
])

/**
 * SubscribeService
 *
 * 职责：管理远端订阅 Drive 的接入与元数据。
 *
 * 订阅流程：
 * 1. 挂载远端资源 Drive
 * 2. 读取完整 `/descriptor.json`（含 ownerProfileKey）
 * 3. 挂载并读取所有者 Profile Drive
 * 4. 持久化订阅记录并返回 owner 摘要
 */
@Injectable()
export class SubscribeService {
  private readonly logger = new Logger(SubscribeService.name)

  constructor(
    private readonly swarm: SwarmService,
    private readonly driveQuery: DriveQueryService,
    private readonly driveService: DriveService,
    private readonly profile: ProfileService,
  ) {}

  async add(driveKey: string): Promise<SubscribeResponseDto> {
    const key = this.normalizeDriveKey(driveKey)
    const existing = this.driveService.findRecord(key)
    if (existing) {
      if (existing.isLocal) {
        throw new BadRequestException(`Drive 已是本地资源，不能作为订阅添加: ${key}`)
      }
      return this.toResponse(existing, await this.resolveOwner(existing.ownerProfileKey ?? ''))
    }

    this.logger.log(`正在挂载远端资源 Drive: ${key}`)
    const remoteDrive = await this.swarm.mountRemoteDrive(key)
    const descriptor = await this.readDescriptor(remoteDrive, key)
    const owner = await this.profile.getOwnerSummary(descriptor.ownerProfileKey)
    const now = Date.now()

    const record: DriveRecord = {
      id: key,
      name: descriptor.name,
      type: descriptor.type,
      isLocal: false,
      ownerProfileKey: descriptor.ownerProfileKey,
      createdAt: now,
      updatedAt: now,
    }

    this.driveService.saveRecord(record)
    this.logger.log(
      `订阅成功: ${key} (${descriptor.name}) owner=${descriptor.ownerProfileKey}`,
    )

    return this.toResponse(record, owner)
  }

  async remove(driveKey: string): Promise<void> {
    const key = this.normalizeDriveKey(driveKey)
    const record = this.driveService.findRecord(key)
    if (!record || record.isLocal) {
      throw new NotFoundException(`订阅的 Drive 不存在: ${key}`)
    }

    await this.swarm.unmountRemoteDrive(key)
    this.driveService.deleteRecord(key)
    this.logger.log(`取消订阅: ${key}`)
  }

  async updateRemark(
    driveKey: string,
    remark: string | null | undefined,
  ): Promise<{ driveKey: string; remark?: string }> {
    const key = this.normalizeDriveKey(driveKey)
    const record = this.driveService.findRecord(key)
    if (!record || record.isLocal) {
      throw new NotFoundException(`订阅的 Drive 不存在: ${key}`)
    }

    record.remark = remark === null || remark === undefined ? undefined : remark
    record.updatedAt = Date.now()
    this.driveService.saveRecord(record)

    return { driveKey: key, remark: record.remark }
  }

  private async readDescriptor(
    drive: Hyperdrive,
    driveKey: string,
  ): Promise<DriveDescriptor> {
    const raw = await readDriveJsonWithRetry<Partial<DriveDescriptor>>(
      this.driveQuery,
      DRIVE_DESCRIPTOR_PATH,
      drive,
    )

    if (!raw) {
      throw new BadRequestException(
        `远端 Drive 缺少 /descriptor.json，无法订阅: ${driveKey}`,
      )
    }

    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const type = raw.type
    const ownerProfileKey = typeof raw.ownerProfileKey === 'string'
      ? raw.ownerProfileKey.trim().toLowerCase()
      : ''

    if (!name) {
      throw new BadRequestException(`descriptor.name 无效: ${driveKey}`)
    }
    if (!DRIVE_CONTENT_TYPES.has(type as DriveContentType)) {
      throw new BadRequestException(`descriptor.type 无效: ${driveKey}`)
    }
    if (!isDrivePublicKey(ownerProfileKey)) {
      throw new BadRequestException(
        `descriptor.ownerProfileKey 无效: ${driveKey}`,
      )
    }

    return {
      name,
      type: type as DriveContentType,
      ownerProfileKey,
    }
  }

  private async resolveOwner(ownerProfileKey: string) {
    if (!isDrivePublicKey(ownerProfileKey)) {
      throw new BadRequestException(
        `订阅记录缺少有效的 ownerProfileKey: ${ownerProfileKey || '(empty)'}`,
      )
    }
    return this.profile.getOwnerSummary(ownerProfileKey)
  }

  private toResponse(
    record: DriveRecord,
    owner: Awaited<ReturnType<ProfileService['getOwnerSummary']>>,
  ): SubscribeResponseDto {
    return {
      driveKey: record.id,
      name: record.name,
      type: record.type,
      createdAt: record.createdAt,
      ownerProfileKey: record.ownerProfileKey ?? owner.driveKey,
      owner,
    }
  }

  private normalizeDriveKey(driveKey: string): string {
    const key = driveKey.trim().toLowerCase()
    if (!isDrivePublicKey(key)) {
      throw new BadRequestException('driveKey 必须是 64 位十六进制字符串')
    }
    return key
  }
}
