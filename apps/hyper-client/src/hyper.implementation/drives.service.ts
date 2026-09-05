import { Injectable, type OnModuleInit } from '@nestjs/common'
import type {
  CreateDriveRequestDto,
  DriveResponseDto,
} from '../hyper.api/dto/drives.dto.js'
import { GetConfigPath } from '../hyper.infrastructure/sdk/hyper-sdk.module.js'
import { SDK } from 'hyper-sdk'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DriveActivity } from '../hyper.infrastructure/sdk/drive-activity.js'

const DRIVE_KEYS_FILE = 'drive-keys.json'

@Injectable()
export class DriveService implements OnModuleInit {
  private readonly driveKeysPath = resolve(
    GetConfigPath(),
    DRIVE_KEYS_FILE,
  )

  constructor(
    private readonly sdk: SDK,
    private readonly activity: DriveActivity = new DriveActivity(),
  ) {}

  async onModuleInit(): Promise<void> {
    const keys = await this.readDriveKeys()
    await Promise.all(keys.map((key) => this.sdk.getDrive(key)))
    console.log(
      `[DriveService] 使用配置目录 ${GetConfigPath()} 恢复了 ${keys.length} 个 Drive`,
    )
  }

  async createDrive(request: CreateDriveRequestDto): Promise<DriveResponseDto> {
    const drive = await this.sdk.getDrive(request.namespace)
    const driveKeyHex = Buffer.from(drive.key).toString('hex')
    await this.rememberDriveKey(driveKeyHex)
    return {
      driveKey: driveKeyHex,
      namespace: request.namespace,
      name: request.name,
      isLocal: true,
      createdAt: new Date().toISOString(),
    }
  }

  // 保留显式 mount 行为，以兼容关闭 SDK autoJoin 后的使用方式。
  async mountDrive(driveKey: string): Promise<Boolean> {
    return this.activity.withUse(driveKey, async () => {
      const drive = await this.sdk.getDrive(driveKey)
      this.sdk.join(drive.discoveryKey)
      return true
    })
  }

  async unmountDrive(driveKey: string): Promise<Boolean> {
    return this.activity.withExclusive(driveKey, async () => {
      const drive = await this.sdk.getDrive(driveKey)
      await this.sdk.leave(drive.discoveryKey)
      await drive.close()
      return true
    })
  }

  async deleteDrive(driveKey: string): Promise<Boolean> {
    return this.activity.withExclusive(driveKey, async () => {
      const drive = await this.sdk.getDrive(driveKey)
      if (!drive) return false
      await drive.close()
      await this.sdk.leave(drive.discoveryKey)
      try {
        await drive.core.clear(0, drive.core.length)
        if (drive.blobs?.core) {
          await drive.blobs.core.clear(0, drive.blobs.core.length)
        }
      } catch (err) {
        console.warn('[DriveService] 清除本地数据时出错，但 drive 已取消订阅:', err)
      }
      await this.forgetDriveKey(driveKey)
      return true
    })
  }

  async purgeDriveForTest(driveKey: string): Promise<{
    ok: boolean
    driveKey: string
    method: 'drive.purge'
    error?: string
  }> {
    return this.activity.withExclusive(driveKey, async () => {
      const drive = await this.sdk.getDrive(driveKey)
      const resolvedDriveKey = Buffer.from(drive.key).toString('hex')

      try {
        await this.sdk.leave(drive.discoveryKey)
        await drive.purge()
        await this.forgetDriveKey(resolvedDriveKey)
        return {
          ok: true,
          driveKey: resolvedDriveKey,
          method: 'drive.purge',
        }
      } catch (err) {
        return {
          ok: false,
          driveKey: resolvedDriveKey,
          method: 'drive.purge',
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })
  }

  async getDrive(driveKey: string): Promise<DriveResponseDto> {
    return this.activity.withUse(driveKey, async () => {
      const drive = await this.sdk.getDrive(driveKey)
      const driveKeyHex = Buffer.from(drive.key).toString('hex')
      return {
        driveKey: driveKeyHex,
        namespace: driveKey,
        name: drive.name || 'unnamed',
        isLocal: true,
        createdAt: new Date().toISOString(),
      }
    })
  }

  async getDrives(): Promise<DriveResponseDto[]> {
    // Hyperdrive 每个实例内部有两个 core（metadata + blobs）
    // sdk.drives 会把两者都列出，用 blobs 字段过滤出完整的 drive
    return this.sdk.drives
      .filter((drive) => !!drive.blobs)
      .map((drive) => {
        const driveKeyHex = Buffer.from(drive.key).toString('hex')
        return {
          driveKey: driveKeyHex,
          namespace: drive.name,
          name: drive.name || 'unnamed',
          type: 'blob' as const,
          isLocal: true,
          createdAt: new Date().toISOString(),
        }
      })
  }

  private async rememberDriveKey(driveKey: string): Promise<void> {
    const existing = await this.readDriveKeys()
    if (!existing.includes(driveKey)) {
      await this.writeDriveKeys([...existing, driveKey])
    }
  }

  async clearDriveBlobs(driveKey: string): Promise<{
    ok: boolean
    driveKey: string
    clearedBlocks?: number
    compacted?: boolean
    error?: string
  }> {
    return this.activity.withExclusive(driveKey, async () => {
      const drive = await this.sdk.getDrive(driveKey)
      const resolvedDriveKey = Buffer.from(drive.key).toString('hex')

      try {
        await this.sdk.leave(drive.discoveryKey)
        const blobCore = drive.blobs?.core as
          | { length?: number; compact?: () => Promise<void> }
          | undefined
        if (!blobCore?.compact) {
          throw new Error('当前 Hyperdrive blob core 不支持 compact。')
        }
        const clearedBlocks = blobCore.length ?? 0
        await drive.clearAll({ diff: true })
        await blobCore.compact()
        return {
          ok: true,
          driveKey: resolvedDriveKey,
          clearedBlocks,
          compacted: true,
        }
      } catch (err) {
        return {
          ok: false,
          driveKey: resolvedDriveKey,
          compacted: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })
  }

  private async forgetDriveKey(driveKey: string): Promise<void> {
    const existing = await this.readDriveKeys()
    await this.writeDriveKeys(existing.filter((key) => key !== driveKey))
  }

  private async readDriveKeys(): Promise<string[]> {
    if (!existsSync(this.driveKeysPath)) return []
    return JSON.parse(await readFile(this.driveKeysPath, 'utf-8')) as string[]
  }

  private async writeDriveKeys(keys: string[]): Promise<void> {
    await writeFile(this.driveKeysPath, JSON.stringify(keys, null, 2), 'utf-8')
  }
}
