import { Inject, Injectable } from '@nestjs/common'
import { isDriveFilePath } from '../hyper.domain/model/drive-file-path.js'
import { HYPER_SDK } from '@hyper.infrastructure/sdk/hyper-sdk.module.js'
import type { SDK } from 'hyper-sdk'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'

const DRIVE_KEY_PATTERN = /^[0-9a-f]{64}$/iu

export type AddFileResultCode =
  | 'created'
  | 'already-exists'
  | 'drive-not-writable'

@Injectable()
export class FileService {
  private readonly pendingWrites = new Map<string, Promise<void>>()

  constructor(
    @Inject(HYPER_SDK)
    private readonly sdk: SDK,
  ) {}

  async addFile(
    driveKey: string,
    path: string,
    content: Readable,
  ): Promise<AddFileResultCode> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) {
      throw new TypeError('driveKey 必须是 64 位十六进制字符串。')
    }

    if (!isDriveFilePath(path)) {
      throw new TypeError('path 必须是规范的 Drive 绝对文件路径。')
    }

    return this.withWriteLock(`${driveKey.toLowerCase()}\0${path}`, async () => {
      const drive = await this.sdk.getDrive(driveKey)

      if (!drive.writable) {
        return 'drive-not-writable'
      }

      const existing = await drive.entry(path, { wait: false })
      if (existing !== null) {
        return 'already-exists'
      }

      await pipeline(content, drive.createWriteStream(path))
      return 'created'
    })
  }

  private async withWriteLock<T>(
    key: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = this.pendingWrites.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => current)
    this.pendingWrites.set(key, tail)

    await previous
    try {
      return await action()
    } finally {
      release()
      if (this.pendingWrites.get(key) === tail) {
        this.pendingWrites.delete(key)
      }
    }
  }
}
