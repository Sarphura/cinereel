import { Injectable, OnModuleInit } from '@nestjs/common'
import type { DriveInterface } from '@hyper.domain/interface/drives/drives.interface.js'
import type {
  CreateDriveRequestDto,
  DriveResponseDto,
} from '@hyper.api/dto/drives.dto.js'
import { create } from 'hyper-sdk'
import type { SDK } from 'hyper-sdk'
import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const DEFAULT_STORAGE_DIR = '.hyper-storage'
const DRIVE_KEYS_FILE = 'drive-keys.json'

@Injectable()
export class DriveService implements DriveInterface, OnModuleInit {
  private sdk!: SDK
  private driveKeysPath!: string

  async onModuleInit() {
    const storageDir = process.env.HYPER_STORAGE_DIR || DEFAULT_STORAGE_DIR
    const storagePath = resolve(process.cwd(), storageDir)
    this.driveKeysPath = resolve(storagePath, DRIVE_KEYS_FILE)
    this.sdk = await create({ storage: storagePath })
    await this.restoreDrives()
    console.log(`[DriveService] initialized with storage: ${storagePath}`)
  }

  private async restoreDrives(): Promise<void> {
    const keys = await this.readDriveKeys()
    await Promise.all(keys.map((key) => this.sdk.getDrive(key)))
    console.log(`[DriveService] restored ${keys.length} drive(s) from storage`)
  }

  private async readDriveKeys(): Promise<string[]> {
    if (!existsSync(this.driveKeysPath)) return []
    return JSON.parse(await readFile(this.driveKeysPath, 'utf-8'))
  }

  private async writeDriveKeys(keys: string[]): Promise<void> {
    await writeFile(this.driveKeysPath, JSON.stringify(keys, null, 2), 'utf-8')
  }

  private async appendDriveKey(driveKey: string): Promise<void> {
    const existing = await this.readDriveKeys()
    if (!existing.includes(driveKey)) {
      await this.writeDriveKeys([...existing, driveKey])
    }
  }

  private async removeDriveKey(driveKey: string): Promise<void> {
    const existing = await this.readDriveKeys()
    await this.writeDriveKeys(existing.filter((k) => k !== driveKey))
  }

  async createDrive(request: CreateDriveRequestDto): Promise<DriveResponseDto> {
    const drive = await this.sdk.getDrive(request.namespace)
    const driveKeyHex = Buffer.from(drive.key).toString('hex')
    await this.appendDriveKey(driveKeyHex)
    return {
      driveKey: driveKeyHex,
      namespace: driveKeyHex,
      name: request.name,
      type: request.type,
      isLocal: true,
      createdAt: new Date().toISOString(),
    }
  }

  // Need to use this mount function, if user not open autoJoin setting in SDK
  async mountDrive(driveKey: string): Promise<Boolean> {
    const drive = await this.sdk.getDrive(driveKey)
    this.sdk.join(drive.discoveryKey)
    return true
  }

  async unmountDrive(driveKey: string): Promise<Boolean> {
    const drive = await this.sdk.getDrive(driveKey)
    this.sdk.leave(drive.discoveryKey)
    await drive.close()
    return true
  }

  async deleteDrive(driveKey: string): Promise<Boolean> {
    const drive = await this.sdk.getDrive(driveKey)
    if (!drive) return false
    await drive.close()
    await this.sdk.leave(driveKey)
    try {
      await drive.core.clear(0, drive.core.length)
      if (drive.blobs?.core) {
        await drive.blobs.core.clear(0, drive.blobs.core.length)
      }
    } catch (err) {
      console.warn('[DriveService] 清除本地数据时出错，但 drive 已取消订阅:', err)
    }
    await this.removeDriveKey(driveKey)
    return true
  }

  async getDrive(driveKey: string): Promise<DriveResponseDto> {
    const drive = await this.sdk.getDrive(driveKey)
    const driveKeyHex = Buffer.from(drive.key).toString('hex')
    return {
      driveKey: driveKeyHex,
      namespace: driveKey,
      name: drive.name || 'unnamed',
      type: drive.blobs ? 'blob' : 'metadata',
      isLocal: true,
      createdAt: new Date().toISOString(),
    }
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
          namespace: driveKeyHex,
          name: drive.name || 'unnamed',
          type: 'blob' as const,
          isLocal: true,
          createdAt: new Date().toISOString(),
        }
      })
  }
}
