import { Injectable } from '@nestjs/common'
import { SDK } from 'hyper-sdk'
import { pipeline } from 'node:stream/promises'
import { Transform, type Readable } from 'node:stream'

const DRIVE_KEY_PATTERN = /^[0-9a-f]{64}$/iu

export const MAX_DRIVE_FILE_PATH_LENGTH = 1024

export const DEFAULT_DIRECTORY_PAGE_SIZE = 100
export const MAX_DIRECTORY_PAGE_SIZE = 500
export const MAX_DRIVE_FILE_SIZE = 500 * 1024 * 1024

const HYPERDRIVE_WRITE_CHUNK_SIZE = 1024 * 1024

class FileTooLargeError extends Error {}

function createHyperdriveWriteChunker(): Transform {
  let totalSize = 0

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      totalSize += chunk.byteLength
      if (totalSize > MAX_DRIVE_FILE_SIZE) {
        callback(new FileTooLargeError())
        return
      }

      for (
        let offset = 0;
        offset < chunk.byteLength;
        offset += HYPERDRIVE_WRITE_CHUNK_SIZE
      ) {
        this.push(chunk.subarray(offset, offset + HYPERDRIVE_WRITE_CHUNK_SIZE))
      }
      callback()
    },
  })
}

export function isDriveFilePath(value: string): boolean {
  if (
    value.length < 2 ||
    value.length > MAX_DRIVE_FILE_PATH_LENGTH ||
    !value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return false
  }

  return value
    .slice(1)
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

export function isDriveDirectoryPath(value: string): boolean {
  if (value === '/') {
    return true
  }

  return isDriveFilePath(value)
}

export function isDrivePathSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_DRIVE_FILE_PATH_LENGTH &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  )
}

export type DirectoryEntryType = 'file' | 'directory' | 'symlink'

export type DirectoryEntry = {
  path: string
  name: string
  type: DirectoryEntryType
  size: number | null
}

export type ListDirectoryResult = {
  path: string
  driveVersion: number
  entries: DirectoryEntry[]
  nextCursor: string | null
}

export type AddFileResultCode =
  | 'created'
  | 'already-exists'
  | 'drive-not-writable'
  | 'file-too-large'

export type DeleteFileResultCode =
  | 'deleted'
  | 'not-found'
  | 'drive-not-writable'

@Injectable()
export class FileService {
  private readonly pendingWrites = new Map<string, Promise<void>>()

  constructor(private readonly sdk: SDK) {}

  async listDirectory(
    driveKey: string,
    path: string,
    cursor: string | undefined,
    limit: number = DEFAULT_DIRECTORY_PAGE_SIZE,
  ): Promise<ListDirectoryResult> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) {
      throw new TypeError('driveKey 必须是 64 位十六进制字符串。')
    }

    if (!isDriveDirectoryPath(path)) {
      throw new TypeError('path 必须是规范的 Drive 绝对目录路径。')
    }

    if (cursor !== undefined && !isDrivePathSegment(cursor)) {
      throw new TypeError('cursor 必须是有效的目录子项名称。')
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DIRECTORY_PAGE_SIZE) {
      throw new TypeError(
        `limit 必须是 1 到 ${MAX_DIRECTORY_PAGE_SIZE} 之间的整数。`,
      )
    }

    const drive = await this.sdk.getDrive(driveKey)
    const entries: DirectoryEntry[] = []
    let hasMore = false

    for await (const childName of drive.readdir(path, { wait: false })) {
      if (
        cursor !== undefined &&
        Buffer.compare(Buffer.from(childName), Buffer.from(cursor)) <= 0
      ) {
        continue
      }

      if (entries.length === limit) {
        hasMore = true
        break
      }

      const childPath = path === '/' ? `/${childName}` : `${path}/${childName}`
      const entry = await drive.entry(childPath, { wait: false })

      if (entry === null) {
        entries.push({
          path: childPath,
          name: childName,
          type: 'directory',
          size: null,
        })
        continue
      }

      entries.push({
        path: childPath,
        name: childName,
        type: typeof entry.value.linkname === 'string' ? 'symlink' : 'file',
        size: entry.value.blob?.byteLength ?? null,
      })
    }

    return {
      path,
      driveVersion: drive.version,
      entries,
      nextCursor: hasMore ? entries.at(-1)?.name ?? null : null,
    }
  }

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

      try {
        await pipeline(
          content,
          createHyperdriveWriteChunker(),
          drive.createWriteStream(path),
        )
        return 'created'
      } catch (error) {
        if (error instanceof FileTooLargeError) {
          return 'file-too-large'
        }
        throw error
      }
    })
  }

  async deleteFile(
    driveKey: string,
    path: string,
  ): Promise<DeleteFileResultCode> {
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
      if (existing === null) {
        return 'not-found'
      }

      await drive.del(path)
      return 'deleted'
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
