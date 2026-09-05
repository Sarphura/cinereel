import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { SDK } from 'hyper-sdk'
import { pipeline } from 'node:stream/promises'
import { Transform, type Readable } from 'node:stream'
import { DriveActivity } from '../hyper.infrastructure/sdk/drive-activity.js'
import { FileReadError, normalizeFileReadError, openFileReadSession, type FileReadOptions, type FileReadSession } from './file-read.js'
import {
  createFileEtag,
  isReservedDrivePath,
  MAX_PROTOCOL_FILE_SIZE,
  PROTOCOL_DIRECTORY_PATH,
  type ProtocolFile,
  type ProtocolWriteCondition,
  type ProtocolWriteResult,
} from './protocol-file.js'

export { FileReadError, normalizeFileReadError } from './file-read.js'
export type { FileReadOptions, FileReadSession, ReadFileDescriptor } from './file-read.js'

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

export type DeleteDirectoryResultCode =
  | 'deleted'
  | 'drive-not-writable'

@Injectable()
export class FileService {
  private readonly pendingWrites = new Map<string, Promise<void>>()
  private readonly pendingReadDrives = new Map<string, ReturnType<SDK['getDrive']>>()

  constructor(
    private readonly sdk: SDK,
    private readonly activity: DriveActivity = new DriveActivity(),
  ) {}

  async openReadSession(driveKey: string, options: FileReadOptions = {}): Promise<FileReadSession> {
    return this.openSession(driveKey, options, false)
  }

  private async openSession(driveKey: string, options: FileReadOptions, protocol: boolean): Promise<FileReadSession> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) {
      throw new TypeError('driveKey 必须是 64 位十六进制字符串。')
    }
    if (options.driveVersion !== undefined && (!Number.isSafeInteger(options.driveVersion) || options.driveVersion < 1)) {
      throw new TypeError('driveVersion 必须是正整数。')
    }
    if (options.driveFork !== undefined && (!Number.isSafeInteger(options.driveFork) || options.driveFork < 0)) {
      throw new TypeError('driveFork 必须是非负整数。')
    }
    if (options.contentFork !== undefined && (!Number.isSafeInteger(options.contentFork) || options.contentFork < 0)) {
      throw new TypeError('contentFork 必须是非负整数。')
    }
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) {
      throw new TypeError('timeoutMs 必须是正整数。')
    }
    const key = driveKey.toLowerCase()
    const release = this.activity.acquire(key)
    const session = await openFileReadSession(key, () => this.getReadDrive(key), (core) => {
      if (core.discovery) return
      // joinCore 会等待首次发现，使用同步 join 后由读取 session 控制元数据等待时间。
      const discovery = this.sdk.join(core.discoveryKey)
      core.discovery = discovery
      core.once('close', () => { void discovery.destroy() })
    }, { ...options, excludePath: protocol ? undefined : isReservedDrivePath }, release)
    return {
      ...session,
      get contentFork() { return session.contentFork },
      async getFile(path) {
        if (!isDriveDirectoryPath(path)) throw new TypeError('path 必须是规范的 Drive 绝对路径。')
        if (!protocol && isReservedDrivePath(path)) throw new FileReadError('reserved-path', 403, '协议目录不能通过普通文件接口访问。')
        return session.getFile(path)
      },
      entries(path) {
        if (!isDriveDirectoryPath(path)) throw new TypeError('path 必须是规范的 Drive 绝对目录路径。')
        if (!protocol && isReservedDrivePath(path)) throw new FileReadError('reserved-path', 403, '协议目录不能通过普通文件接口访问。')
        return session.entries(path)
      },
    }
  }

  async readProtocolFile(driveKey: string, path: string, options: FileReadOptions = {}): Promise<ProtocolFile> {
    this.assertProtocolPath(path)
    const session = await this.openSession(driveKey, options, true)
    try {
      const file = await session.getFile(path)
      if (file.size > MAX_PROTOCOL_FILE_SIZE) throw new FileReadError('file-too-large', 413, '协议文件不能超过 64 KiB。')
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of session.createReadStream(file)) {
        size += Buffer.byteLength(chunk)
        if (size > MAX_PROTOCOL_FILE_SIZE) throw new FileReadError('file-too-large', 413, '协议文件不能超过 64 KiB。')
        chunks.push(Buffer.from(chunk))
      }
      if (size !== file.size) throw new FileReadError('content-unavailable', 503, '协议文件内容长度不符。')
      return { content: Buffer.concat(chunks), etag: file.etag, driveVersion: session.driveVersion }
    } catch (error) {
      throw normalizeFileReadError(error)
    } finally {
      await session.close()
    }
  }

  async writeProtocolFile(
    driveKey: string,
    path: string,
    content: Buffer,
    condition: ProtocolWriteCondition,
    signal?: AbortSignal,
  ): Promise<ProtocolWriteResult> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) throw new TypeError('driveKey 必须是 64 位十六进制字符串。')
    this.assertProtocolPath(path)
    if (content.byteLength > MAX_PROTOCOL_FILE_SIZE) throw new FileReadError('file-too-large', 413, '协议文件不能超过 64 KiB。')
    const key = driveKey.toLowerCase()
    return this.activity.withUse(key, () => this.withWriteLock(key, async () => {
      signal?.throwIfAborted()
      const drive = await this.sdk.getDrive(key, { autoJoin: false })
      if (!drive.writable) throw new FileReadError('drive-not-writable', 403, '当前 Hyper Client 没有该 Drive 的写权限。')
      await this.assertDirectoryAncestors(drive, path)
      const entry = await drive.entry(path, { wait: false, follow: false })
      if (entry && (typeof entry.value.linkname === 'string' || !entry.value.blob)) {
        throw new FileReadError('path-conflict', 409, '协议文件路径被非文件 entry 占用。')
      }
      for await (const _ of drive.list(path, { wait: false })) {
        throw new FileReadError('path-conflict', 409, '协议文件路径被目录占用。')
      }
      const blobs = await drive.getBlobs()
      const currentEtag = entry ? createFileEtag(key, drive.core.fork, entry.seq, path, entry.value.blob.byteLength > 0 ? blobs.core.fork : null) : undefined
      if ('ifNoneMatch' in condition ? entry !== null : condition.ifMatch !== currentEtag) {
        throw new FileReadError('precondition-failed', 412, '协议文件已被其他写入修改。')
      }
      signal?.throwIfAborted()
      // put 先完成 blob 写入，再以一次元数据提交替换 entry；失败时旧正文仍可读取。
      await drive.put(path, content)
      const updated = await drive.entry(path, { wait: false, follow: false })
      if (!updated) throw new FileReadError('content-unavailable', 503, '协议文件写入后的元数据不可用。')
      return {
        created: entry === null,
        etag: createFileEtag(key, drive.core.fork, updated.seq, path, content.byteLength > 0 ? blobs.core.fork : null),
        driveVersion: drive.version,
      }
    }))
  }

  private assertProtocolPath(path: string): void {
    if (!isDriveFilePath(path) || !path.startsWith(`${PROTOCOL_DIRECTORY_PATH}/`)) {
      throw new FileReadError('invalid-path', 400, '协议文件必须位于 /.cinereel/ 目录内。')
    }
  }

  private assertOrdinaryPath(path: string): void {
    if (isReservedDrivePath(path)) throw new ForbiddenException('协议目录不能通过普通文件接口访问。')
  }

  private async assertDirectoryAncestors(drive: Awaited<ReturnType<SDK['getDrive']>>, path: string): Promise<void> {
    let end = path.indexOf('/', 1)
    while (end !== -1) {
      if (await drive.entry(path.slice(0, end), { wait: false, follow: false })) {
        throw new ConflictException('父路径被文件或符号链接占用。')
      }
      end = path.indexOf('/', end + 1)
    }
  }

  private getReadDrive(key: string): ReturnType<SDK['getDrive']> {
    const pending = this.pendingReadDrives.get(key)
    if (pending) return pending
    // SDK 缓存仅在 ready 后填充，合并同 key 的首次打开，避免出现多个共享 Drive。
    const release = this.activity.acquire(key)
    const opening = this.sdk.getDrive(key, { autoJoin: false }).finally(() => {
      this.pendingReadDrives.delete(key)
      release()
    })
    this.pendingReadDrives.set(key, opening)
    return opening
  }

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
    this.assertOrdinaryPath(path)

    if (cursor !== undefined && !isDrivePathSegment(cursor)) {
      throw new TypeError('cursor 必须是有效的目录子项名称。')
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DIRECTORY_PAGE_SIZE) {
      throw new TypeError(
        `limit 必须是 1 到 ${MAX_DIRECTORY_PAGE_SIZE} 之间的整数。`,
      )
    }

    return this.activity.withUse(driveKey, async () => {
      const drive = await this.sdk.getDrive(driveKey)
      await this.assertDirectoryAncestors(drive, path)
      const entries: DirectoryEntry[] = []
      let hasMore = false

      for await (const childName of drive.readdir(path, { wait: false })) {
        const childPath = path === '/' ? `/${childName}` : `${path}/${childName}`
        if (isReservedDrivePath(childPath)) continue
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

        const entry = await drive.entry(childPath, { wait: false, follow: false })

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
    })
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
    this.assertOrdinaryPath(path)

    return this.activity.withUse(driveKey, () => this.withWriteLock(driveKey.toLowerCase(), async () => {
      const drive = await this.sdk.getDrive(driveKey)

      if (!drive.writable) {
        return 'drive-not-writable'
      }

      await this.assertDirectoryAncestors(drive, path)

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
    }))
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
    this.assertOrdinaryPath(path)

    return this.activity.withUse(driveKey, () => this.withWriteLock(driveKey.toLowerCase(), async () => {
      const drive = await this.sdk.getDrive(driveKey)

      if (!drive.writable) {
        return 'drive-not-writable'
      }

      await this.assertDirectoryAncestors(drive, path)

      const existing = await drive.entry(path, { wait: false })
      if (existing === null) {
        return 'not-found'
      }

      await drive.del(path)
      return 'deleted'
    }))
  }

  async deleteDirectory(
    driveKey: string,
    path: string,
  ): Promise<DeleteDirectoryResultCode> {
    if (!DRIVE_KEY_PATTERN.test(driveKey)) {
      throw new TypeError('driveKey 必须是 64 位十六进制字符串。')
    }

    if (!isDriveDirectoryPath(path)) {
      throw new TypeError('path 必须是规范的 Drive 绝对目录路径。')
    }
    this.assertOrdinaryPath(path)

    return this.activity.withUse(driveKey, () => this.withWriteLock(driveKey.toLowerCase(), async () => {
      const drive = await this.sdk.getDrive(driveKey)

      if (!drive.writable) {
        return 'drive-not-writable'
      }

      await this.assertDirectoryAncestors(drive, path)

      // Drive 级锁保证进程内没有并发 mutation，
      // 因此锁内枚举得到的输入集合是稳定的（等价于固定版本快照）。
      const keys: string[] = []
      for await (const node of drive.list(path)) {
        if (!isReservedDrivePath(node.key)) keys.push(node.key)
      }

      // 目录自身若为叶 entry，也一并删除；根 '/' 没有自身 entry。
      if (path !== '/') {
        const self = await drive.entry(path, { wait: false })
        if (self !== null) {
          keys.push(path)
        }
      }

      for (const key of keys) {
        await drive.del(key)
      }

      // 无后代也返回 deleted（幂等）。
      return 'deleted'
    }))
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
