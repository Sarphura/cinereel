import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common'
import type Hyperdrive from 'hyperdrive'
import { HyperService } from '@/modules/base/hyper/hyper.service'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { DriveWriteService } from '@/modules/base/drive/service/drive.write.service'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import {
  PROFILE_DOCUMENT_PATH,
  type ProfileCollection,
  type ProfileDocument,
} from '@/modules/common/domain/drive-manifest'
import {
  isDrivePublicKey,
  readDriveJsonWithRetry,
} from '@/modules/common/utils/drive-json.util'
import type {
  ProfileOwnerSummaryDto,
  ProfileResponseDto,
  UpdateProfileDto,
} from '../domain/dto/profile.dto'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

const AVATAR_FORMATS = {
  'image/png': { path: '/avatar.png', signature: 'png' },
  'image/jpeg': { path: '/avatar.jpg', signature: 'jpeg' },
  'image/webp': { path: '/avatar.webp', signature: 'webp' },
} as const

type AvatarContentType = keyof typeof AVATAR_FORMATS

@Injectable()
export class ProfileService implements OnModuleInit {
  constructor(
    private readonly hyper: HyperService,
    private readonly driveQuery: DriveQueryService,
    private readonly driveWrite: DriveWriteService,
    private readonly swarm: SwarmService,
  ) {}

  async onModuleInit(): Promise<void> {
    const profile = await this.driveQuery.getJson<ProfileDocument>(
      PROFILE_DOCUMENT_PATH,
      false,
      this.hyper.drive,
    )
    if (profile) return

    await this.driveWrite.putJson(
      PROFILE_DOCUMENT_PATH,
      this.createEmptyProfile(),
      this.hyper.drive,
    )
  }

  async getCurrent(): Promise<ProfileResponseDto> {
    return this.toResponse(await this.readLocalProfile(), this.hyper.driveKey)
  }

  async getByDriveKey(profileKey: string): Promise<ProfileResponseDto> {
    const key = this.normalizeProfileKey(profileKey)
    if (key === this.hyper.driveKey) {
      return this.getCurrent()
    }

    const drive = await this.swarm.mountRemoteDrive(key)
    const profile = await this.readProfileFromDrive(drive, true)
    if (!profile) {
      throw new NotFoundException(`无法读取 Profile Drive: ${key}`)
    }
    return this.toResponse(profile, key)
  }

  async getOwnerSummary(profileKey: string): Promise<ProfileOwnerSummaryDto> {
    const profile = await this.getByDriveKey(profileKey)
    return {
      driveKey: profile.driveKey,
      name: profile.name,
      bio: profile.bio,
      avatarPath: profile.avatarPath,
      avatarUrl: profile.avatarUrl,
      updatedAt: profile.updatedAt,
    }
  }

  async update(dto: UpdateProfileDto): Promise<ProfileResponseDto> {
    this.validateTextFields(dto)

    const profile = await this.readLocalProfile()
    if (
      dto.name === undefined
      && dto.bio === undefined
      && dto.avatarDataUrl === undefined
    ) {
      return this.toResponse(profile, this.hyper.driveKey)
    }

    const previousAvatarPath = profile.avatarPath
    let nextAvatarPath = previousAvatarPath

    if (dto.avatarDataUrl === null) {
      nextAvatarPath = null
    } else if (dto.avatarDataUrl !== undefined) {
      const avatar = this.decodeAvatarDataUrl(dto.avatarDataUrl)
      nextAvatarPath = AVATAR_FORMATS[avatar.contentType].path
      await this.driveWrite.put(nextAvatarPath, avatar.buffer, this.hyper.drive)
    }

    const updated: ProfileDocument = {
      ...profile,
      name: dto.name ?? profile.name,
      bio: dto.bio ?? profile.bio,
      avatarPath: nextAvatarPath,
      updatedAt: Date.now(),
    }
    await this.driveWrite.putJson(PROFILE_DOCUMENT_PATH, updated, this.hyper.drive)

    if (previousAvatarPath && previousAvatarPath !== nextAvatarPath) {
      await this.driveWrite.clearAndDel(previousAvatarPath, this.hyper.drive)
    }

    return this.toResponse(updated, this.hyper.driveKey)
  }

  async getAvatar(): Promise<{ buffer: Buffer; contentType: AvatarContentType }> {
    return this.getAvatarFromDrive(this.hyper.drive, await this.readLocalProfile())
  }

  async getAvatarByDriveKey(
    profileKey: string,
  ): Promise<{ buffer: Buffer; contentType: AvatarContentType }> {
    const key = this.normalizeProfileKey(profileKey)
    if (key === this.hyper.driveKey) {
      return this.getAvatar()
    }

    const drive = await this.swarm.mountRemoteDrive(key)
    const profile = await this.readProfileFromDrive(drive, true)
    if (!profile) {
      throw new NotFoundException(`无法读取 Profile Drive: ${key}`)
    }
    return this.getAvatarFromDrive(drive, profile)
  }

  async upsertCollection(collection: ProfileCollection): Promise<void> {
    const profile = await this.readLocalProfile()
    const existing = profile.collections.find((item) => item.driveKey === collection.driveKey)

    profile.collections = [
      ...profile.collections.filter((item) => item.driveKey !== collection.driveKey),
      {
        ...collection,
        addedAt: existing?.addedAt ?? collection.addedAt,
      },
    ]
    profile.updatedAt = collection.updatedAt

    await this.driveWrite.putJson(PROFILE_DOCUMENT_PATH, profile, this.hyper.drive)
  }

  async removeCollection(driveKey: string): Promise<void> {
    const profile = await this.readLocalProfile()
    const collections = profile.collections.filter((item) => item.driveKey !== driveKey)
    if (collections.length === profile.collections.length) return

    profile.collections = collections
    profile.updatedAt = Date.now()
    await this.driveWrite.putJson(PROFILE_DOCUMENT_PATH, profile, this.hyper.drive)
  }

  private async getAvatarFromDrive(
    drive: Hyperdrive,
    profile: ProfileDocument,
  ): Promise<{ buffer: Buffer; contentType: AvatarContentType }> {
    if (!profile.avatarPath) {
      throw new NotFoundException('尚未设置头像')
    }

    const contentType = this.contentTypeFromPath(profile.avatarPath)
    const buffer = await this.driveQuery.get(profile.avatarPath, drive !== this.hyper.drive, drive)
    if (!buffer) {
      throw new NotFoundException('头像文件不存在')
    }

    return { buffer, contentType }
  }

  private async readLocalProfile(): Promise<ProfileDocument> {
    const profile = await this.readProfileFromDrive(this.hyper.drive, false)
    return profile ?? this.createEmptyProfile()
  }

  private async readProfileFromDrive(
    drive: Hyperdrive,
    wait: boolean,
  ): Promise<ProfileDocument | null> {
    const stored = wait
      ? await readDriveJsonWithRetry<Partial<ProfileDocument>>(
          this.driveQuery,
          PROFILE_DOCUMENT_PATH,
          drive,
        )
      : await this.driveQuery.getJson<Partial<ProfileDocument>>(
          PROFILE_DOCUMENT_PATH,
          false,
          drive,
        )

    if (!stored) return null
    return this.normalizeProfileDocument(stored)
  }

  private normalizeProfileDocument(stored: Partial<ProfileDocument>): ProfileDocument {
    return {
      name: typeof stored.name === 'string' ? stored.name : '',
      bio: typeof stored.bio === 'string' ? stored.bio : '',
      avatarPath: typeof stored.avatarPath === 'string' ? stored.avatarPath : null,
      updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0,
      collections: Array.isArray(stored.collections) ? stored.collections : [],
    }
  }

  private createEmptyProfile(): ProfileDocument {
    return {
      name: '',
      bio: '',
      avatarPath: null,
      updatedAt: Date.now(),
      collections: [],
    }
  }

  private toResponse(profile: ProfileDocument, driveKey: string): ProfileResponseDto {
    const isLocal = driveKey === this.hyper.driveKey
    return {
      driveKey,
      ...profile,
      avatarUrl: profile.avatarPath
        ? isLocal
          ? `/api/profile/avatar?v=${profile.updatedAt}`
          : `/api/profile/${driveKey}/avatar?v=${profile.updatedAt}`
        : null,
    }
  }

  private normalizeProfileKey(profileKey: string): string {
    const key = profileKey.trim().toLowerCase()
    if (!isDrivePublicKey(key)) {
      throw new BadRequestException('profileKey 必须是 64 位十六进制字符串')
    }
    return key
  }

  private validateTextFields(dto: UpdateProfileDto): void {
    if (dto.name !== undefined && (typeof dto.name !== 'string' || dto.name.length > 80)) {
      throw new BadRequestException('显示名称必须是长度不超过 80 的字符串')
    }
    if (dto.bio !== undefined && (typeof dto.bio !== 'string' || dto.bio.length > 2000)) {
      throw new BadRequestException('简介必须是长度不超过 2000 的字符串')
    }
  }

  private decodeAvatarDataUrl(dataUrl: string): {
    buffer: Buffer
    contentType: AvatarContentType
  } {
    if (typeof dataUrl !== 'string') {
      throw new BadRequestException('头像必须是 Data URL 字符串')
    }

    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl)
    if (!match) {
      throw new BadRequestException('头像仅支持 PNG、JPEG 或 WebP Data URL')
    }

    const contentType = match[1] as AvatarContentType
    const buffer = Buffer.from(match[2], 'base64')
    if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) {
      throw new BadRequestException('头像大小必须在 1 字节到 5 MB 之间')
    }
    if (!this.hasExpectedSignature(buffer, AVATAR_FORMATS[contentType].signature)) {
      throw new BadRequestException('头像内容与声明的图片格式不匹配')
    }

    return { buffer, contentType }
  }

  private hasExpectedSignature(
    buffer: Buffer,
    signature: 'png' | 'jpeg' | 'webp',
  ): boolean {
    if (signature === 'png') {
      return buffer.length >= 8
        && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    }
    if (signature === 'jpeg') {
      return buffer.length >= 3
        && buffer[0] === 0xff
        && buffer[1] === 0xd8
        && buffer[2] === 0xff
    }
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }

  private contentTypeFromPath(path: string): AvatarContentType {
    if (path.endsWith('.png')) return 'image/png'
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
    if (path.endsWith('.webp')) return 'image/webp'
    throw new NotFoundException('头像格式不受支持')
  }
}
