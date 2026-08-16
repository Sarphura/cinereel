import { Injectable } from '@nestjs/common'
import type { DriveInterface } from '@hyper.domain/interface/drives/drives.interface.js'
import type {
  CreateDriveRequestDto,
  DriveResponseDto,
} from '@hyper.api/dto/drives.dto.js'
import { create } from 'hyper-sdk'
import type { SDK } from 'hyper-sdk'

@Injectable()
export class DriveService implements DriveInterface {
  private sdk: SDK

  constructor() {
    this.sdk = create() as any
  }

  async createDrive(request: CreateDriveRequestDto): Promise<Boolean> {
    const namespace = request.namespace
    const drive = await this.sdk.getDrive(namespace)
    return true
  }

  async mountDrive(driveKey: string): Promise<Boolean> {
    const drive = await this.sdk.getDrive(driveKey)
    await drive.mount()
    return true
  }

  async unmountDrive(driveKey: string): Promise<Boolean> {
    const drive = await this.sdk.getDrive(driveKey)
    await drive.close();
    return true;
  }

  async deleteDrive(driveKey: string): Promise<Boolean> {
    const drive = await this.sdk.getDrive(driveKey)
    if (!drive) return false

    await drive.core.purge()
    if (drive.blobs?.core) {
      await drive.blobs.core.purge()
    }

    await drive.close()
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
    const drives = this.sdk.drives
    
    return drives.map((drive) => {
      const driveKeyHex = Buffer.from(drive.key).toString('hex')
      
      return {
        driveKey: driveKeyHex,
        namespace: driveKeyHex,
        name: drive.name || 'unnamed',
        type: drive.blobs ? 'blob' : 'metadata',
        isLocal: true,
        createdAt: new Date().toISOString(),
      }
    })
  }
}
