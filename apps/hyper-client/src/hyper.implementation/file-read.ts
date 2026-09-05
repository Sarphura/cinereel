import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import type { SDK } from 'hyper-sdk'
import { createFileEtag } from './protocol-file.js'

export const DEFAULT_FILE_READ_TIMEOUT_MS = 30_000

export class FileReadError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'FileReadError'
  }
}

export type ReadFileDescriptor = {
  path: string
  type: 'file' | 'symlink'
  size: number
  etag: string
}

export type FileReadOptions = {
  driveVersion?: number
  driveFork?: number
  contentFork?: number
  signal?: AbortSignal
  timeoutMs?: number
  excludePath?: (path: string) => boolean
}

export interface FileReadSession {
  readonly driveVersion: number
  readonly driveFork: number
  readonly contentFork: number | null
  prepareContent(): Promise<number | null>
  getFile(path: string): Promise<ReadFileDescriptor>
  entries(directoryPath: string): AsyncIterable<ReadFileDescriptor>
  createReadStream(file: ReadFileDescriptor, range?: { start?: number; end?: number }): Readable
  hasFile(file: ReadFileDescriptor): Promise<boolean>
  close(): Promise<void>
}

type BlobId = {
  blockOffset: number
  blockLength: number
  byteOffset: number
  byteLength: number
  blockMap?: boolean
}

type FileEntry = {
  seq: number
  key: string
  value: { linkname: string | null; blob: BlobId | null }
}

type SourceStream<T> = AsyncIterable<T> & {
  destroy(error?: Error): void
  on(event: 'error', listener: (error: Error) => void): unknown
}

// hyper-sdk 附带的声明未覆盖以下已核对的 Hyperdrive 13 / Hypercore 11 API。
interface ReadCore {
  length: number
  fork: number
  timeout: number
  writable: boolean
  discoveryKey: Buffer
  discovery?: { destroy(): Promise<void> | void }
  session(options: { timeout: number; wait: boolean }): ReadCore
  ready(): Promise<void>
  update(options: { wait: boolean }): Promise<boolean>
  get(index: number, options?: { wait?: boolean; timeout?: number }): Promise<Buffer | null>
  has(start: number, end?: number): Promise<boolean>
  close(): Promise<void>
  once(event: 'close', listener: () => void): unknown
  on(event: 'truncate', listener: () => void): unknown
  off(event: 'truncate', listener: () => void): unknown
}

interface ReadBlobs {
  constructor: new (core: ReadCore) => ReadBlobs
  core: ReadCore
  getByteLength(blob: BlobId): Promise<number>
  createReadStream(blob: BlobId, options: {
    core: ReadCore
    timeout: number
    wait?: boolean
    prefetch: boolean
    start?: number
    end?: number
  }): SourceStream<Buffer>
}

interface ReadDrive {
  core: ReadCore
  version: number
  writable: boolean
  ready(): Promise<void>
  close(): Promise<void>
  checkout(version: number): ReadDrive
  getBlobs(): Promise<ReadBlobs | null>
  entry(path: string, options: { timeout: number; follow: false }): Promise<FileEntry | null>
  list(path: string, options: { timeout: number }): SourceStream<FileEntry>
}

export function normalizeFileReadError(error: unknown): FileReadError {
  if (error instanceof FileReadError) return error
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  if (code === 'REQUEST_TIMEOUT' || code === 'ETIMEDOUT') {
    return new FileReadError('read-timeout', 504, '等待远端数据超时。', { cause: error })
  }
  if (code === 'REQUEST_CANCELLED' || code === 'ABORT_ERR') {
    return new FileReadError('read-canceled', 499, '读取已取消。', { cause: error })
  }
  if (typeof code === 'string' && (
    ['ENOSPC', 'EIO', 'EDQUOT', 'EROFS', 'EACCES', 'EPERM', 'EMFILE', 'ENFILE'].includes(code)
    || code.startsWith('ROCKSDB_')
  )) {
    return new FileReadError('storage-error', 500, '本地存储不可用。', { cause: error })
  }
  return new FileReadError('content-unavailable', 503, '指定版本的内容暂不可用。', { cause: error })
}

function canceled(): FileReadError {
  return new FileReadError('read-canceled', 499, '读取已取消。')
}

function bounded<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const finish = (action: () => void) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      action()
    }
    const abort = () => finish(() => reject(canceled()))
    const timer = setTimeout(() => finish(() => reject(
      new FileReadError('read-timeout', 504, '等待远端数据超时。'),
    )), timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)))
    if (signal.aborted) abort()
  })
}

export async function openFileReadSession(
  driveKey: string,
  getDrive: () => ReturnType<SDK['getDrive']>,
  join: (core: ReadCore) => void,
  options: FileReadOptions,
  release: () => void,
): Promise<FileReadSession> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FILE_READ_TIMEOUT_MS
  const preparationDeadline = Date.now() + timeoutMs
  let preparing = true
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()

  let preparationCore: ReadCore | undefined
  let checkout: ReadDrive | undefined
  let contentCore: ReadCore | undefined
  let closed = false
  let closing: Promise<void> | undefined
  let versionError: FileReadError | undefined
  let detachVersionListeners = () => {}
  const streams = new Set<{ destroy(error?: Error): void }>()
  const outputs = new Set<Readable>()
  const close = (): Promise<void> => {
    if (closing) return closing
    closed = true
    controller.abort()
    detachVersionListeners()
    options.signal?.removeEventListener('abort', abort)
    const stopped = [...outputs].map((stream) => finished(stream).catch(() => {}))
    for (const stream of streams) stream.destroy(versionError ?? canceled())
    closing = Promise.allSettled([
      preparationCore?.close(),
      contentCore?.close(),
      checkout?.close(),
      ...stopped,
    ]).then(() => { release() })
    return closing
  }
  const checkOpen = () => {
    if (versionError) throw versionError
    if (closed || controller.signal.aborted) throw canceled()
  }
  const wait = <T>(promise: Promise<T>) => bounded(
    promise,
    preparing ? Math.max(1, preparationDeadline - Date.now()) : timeoutMs,
    controller.signal,
  )

  try {
    checkOpen()
    const drive = await wait(getDrive()) as unknown as ReadDrive
    checkOpen()
    join(drive.core)
    preparationCore = drive.core.session({ timeout: timeoutMs, wait: true })
    await wait(preparationCore.ready())

    // 新远端 length=0 并不表示空盘，必须拿到有签名的元数据头后才能判定不存在。
    if (!drive.writable || preparationCore.length > 0) {
      const header = await wait(preparationCore.get(0, { timeout: timeoutMs }))
      if (!header) throw new FileReadError('content-unavailable', 503, 'Drive 元数据暂不可用。')
    }
    const driveVersion = options.driveVersion ?? drive.version
    if (driveVersion > preparationCore.length && !(driveVersion === 1 && drive.writable)) {
      await wait(preparationCore.get(driveVersion - 1, { timeout: timeoutMs }))
    }
    const driveFork = preparationCore.fork
    if (options.driveFork !== undefined && options.driveFork !== driveFork) {
      throw new FileReadError('version-unavailable', 503, 'Drive 已发生截断，原版本不可用。')
    }
    checkout = drive.checkout(driveVersion)
    await wait(checkout.ready())
    checkout.core.timeout = timeoutMs
    if (checkout.core.fork !== driveFork) {
      throw new FileReadError('version-unavailable', 503, '建立读取快照时 Drive 版本已改变。')
    }
    const blobs = await wait(checkout.getBlobs())
    if (!blobs) throw new FileReadError('content-unavailable', 503, 'Drive 内容元数据暂不可用。')
    contentCore = blobs.core.session({ timeout: timeoutMs, wait: true })
    await wait(contentCore.ready())
    await preparationCore.close()
    preparationCore = undefined
    checkOpen()
    preparing = false

    const fixedDrive = checkout
    const fixedContentCore = contentCore
    const sessionBlobs = new blobs.constructor(fixedContentCore)
    let contentFork: number | null = fixedContentCore.length > 0 ? fixedContentCore.fork : null
    const invalidateVersion = () => {
      versionError = new FileReadError('version-unavailable', 503, '读取期间 Drive 已发生截断，原版本不可用。')
      void close()
    }
    drive.core.on('truncate', invalidateVersion)
    const onContentTruncate = () => {
      // 首次收到远端签名历史也会触发 truncate；在获知正文 fork 后才算版本改变。
      if (contentFork !== null) invalidateVersion()
    }
    fixedContentCore.on('truncate', onContentTruncate)
    detachVersionListeners = () => {
      drive.core.off('truncate', invalidateVersion)
      fixedContentCore.off('truncate', onContentTruncate)
    }
    if (drive.core.fork !== driveFork) {
      invalidateVersion()
      throw versionError
    }
    const assertContentIdentity = () => {
      checkOpen()
      if (contentFork !== null && (
        fixedContentCore.fork !== contentFork
        || (options.contentFork !== undefined && options.contentFork !== contentFork)
      )) {
        invalidateVersion()
        throw versionError
      }
    }
    let confirmingContent: Promise<number> | undefined
    const confirmContent = async (required: boolean): Promise<number | null> => {
      assertContentIdentity()
      if (contentFork !== null || (!required && options.contentFork === undefined)) return contentFork
      confirmingContent ??= (async () => {
        if (!fixedContentCore.writable) {
          await wait(fixedContentCore.update({ wait: true }))
          checkOpen()
          if (fixedContentCore.length === 0) {
            throw new FileReadError('content-unavailable', 503, '正文签名元数据暂不可用。')
          }
        }
        // 可写 core 的空历史由本地所有者确认；远端初始 fork=0 必须等到签名头。
        contentFork = fixedContentCore.fork
        assertContentIdentity()
        return contentFork
      })()
      return await confirmingContent
    }
    let preparingContent: Promise<number | null> | undefined
    const prepareContent = async (): Promise<number | null> => {
      assertContentIdentity()
      if (contentFork !== null) return contentFork
      preparingContent ??= (async () => {
        const source = fixedDrive.list('/', { timeout: timeoutMs })
        source.on('error', () => {})
        streams.add(source)
        try {
          const iterator = source[Symbol.asyncIterator]()
          while (true) {
            const item = await wait(iterator.next())
            if (item.done) return await confirmContent(false)
            if ((item.value.value.blob?.blockLength ?? 0) > 0) return await confirmContent(true)
          }
        } finally {
          streams.delete(source)
          source.destroy()
        }
      })()
      try {
        return await preparingContent
      } catch (error) {
        throw versionError ?? normalizeFileReadError(error)
      }
    }
    const descriptors = new WeakMap<ReadFileDescriptor, FileEntry>()
    const describe = async (entry: FileEntry): Promise<ReadFileDescriptor> => {
      if (typeof entry.value.linkname !== 'string' && !entry.value.blob) {
        throw new FileReadError('not-file', 409, '目标 entry 没有文件内容。')
      }
      if (entry.value.blob) await confirmContent(entry.value.blob.blockLength > 0)
      const size = entry.value.blob ? await wait(sessionBlobs.getByteLength(entry.value.blob)) : 0
      const file: ReadFileDescriptor = {
        path: entry.key,
        type: typeof entry.value.linkname === 'string' ? 'symlink' : 'file',
        // blockMap 的 byteLength 是映射长度，逻辑文件长度必须由原生 API 解析。
        size,
        etag: createFileEtag(driveKey, driveFork, entry.seq, entry.key, size > 0 ? contentFork : null),
      }
      descriptors.set(file, entry)
      return file
    }
    const getEntry = (file: ReadFileDescriptor): FileEntry => {
      assertContentIdentity()
      const entry = descriptors.get(file)
      if (!entry || file.type !== 'file') {
        throw new FileReadError('invalid-file', 409, '文件描述不属于本次读取会话或目标为符号链接。')
      }
      return entry
    }

    const assertDirectoryAncestors = async (path: string) => {
      let end = path.indexOf('/', 1)
      while (end !== -1) {
        const ancestor = await wait(fixedDrive.entry(path.slice(0, end), { timeout: timeoutMs, follow: false }))
        if (ancestor) throw new FileReadError('path-conflict', 409, '父路径被文件或符号链接占用。')
        end = path.indexOf('/', end + 1)
      }
    }

    async function* entries(directoryPath: string): AsyncGenerator<ReadFileDescriptor> {
      checkOpen()
      let source: SourceStream<FileEntry> | undefined
      try {
        await assertDirectoryAncestors(directoryPath)
        if (directoryPath !== '/') {
          const self = await wait(fixedDrive.entry(directoryPath, { timeout: timeoutMs, follow: false }))
          if (self) throw new FileReadError('not-directory', 409, '目标路径不是目录。')
        }
        source = fixedDrive.list(directoryPath, { timeout: timeoutMs })
        source.on('error', () => {})
        streams.add(source)
        let found = false
        const iterator = source[Symbol.asyncIterator]()
        while (true) {
          const item = await wait(iterator.next())
          if (item.done) break
          if (options.excludePath?.(item.value.key)) continue
          found = true
          yield await describe(item.value)
        }
        if (!found && directoryPath !== '/') throw new FileReadError('not-found', 404, '目录不存在。')
      } catch (error) {
        throw versionError ?? normalizeFileReadError(error)
      } finally {
        if (source) {
          streams.delete(source)
          source.destroy()
        }
      }
    }

    const createStream = (file: ReadFileDescriptor, range?: { start?: number; end?: number }, localOnly = false): Readable => {
      const entry = getEntry(file)
      const blob = entry.value.blob
      if (!blob || file.size === 0) return Readable.from([], { objectMode: false })
      const source = sessionBlobs.createReadStream(blob, {
        core: fixedContentCore,
        timeout: timeoutMs,
        wait: !localOnly,
        prefetch: false,
        ...range,
      })
      source.on('error', () => {})
      streams.add(source)
      const iterator = source[Symbol.asyncIterator]()
      let reading = false
      const output = new Readable({
        read() {
          if (reading) return
          reading = true
          iterator.next().then((item) => {
            reading = false
            if (!this.destroyed) {
              try {
                assertContentIdentity()
                this.push(item.done ? null : item.value)
              } catch (error) {
                this.destroy(normalizeFileReadError(error))
              }
            }
          }, (error) => { this.destroy(normalizeFileReadError(error)) })
        },
        destroy(error, callback) {
          streams.delete(output)
          streams.delete(source)
          // 必须先销毁底层流，才能解除正在等待缺块的 iterator.next()。
          source.destroy()
          Promise.resolve(iterator.return?.()).then(
            () => callback(error),
            (failure) => callback(error ?? normalizeFileReadError(failure)),
          )
        },
      })
      output.on('error', () => {})
      streams.add(output)
      outputs.add(output)
      output.once('close', () => {
        outputs.delete(output)
        streams.delete(output)
        streams.delete(source)
        source.destroy()
      })
      return output
    }

    const onAbort = () => { void close() }
    options.signal?.removeEventListener('abort', abort)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const baseClose = close
    const sessionClose = async () => {
      options.signal?.removeEventListener('abort', onAbort)
      await baseClose()
    }

    return {
      driveVersion,
      driveFork,
      get contentFork() { return contentFork },
      prepareContent,
      async getFile(path) {
        checkOpen()
        try {
          if (path === '/') throw new FileReadError('not-file', 409, '目标路径为目录。')
          await assertDirectoryAncestors(path)
          const entry = await wait(fixedDrive.entry(path, { timeout: timeoutMs, follow: false }))
          if (entry) {
            if (typeof entry.value.linkname === 'string') {
              throw new FileReadError('not-file', 409, '目标路径为符号链接。')
            }
            return await describe(entry)
          }
          for await (const _ of entries(path)) {
            throw new FileReadError('not-file', 409, '目标路径为目录。')
          }
          throw new FileReadError('not-found', 404, '文件不存在。')
        } catch (error) {
          throw versionError ?? normalizeFileReadError(error)
        }
      },
      entries,
      createReadStream: createStream,
      async hasFile(file) {
        const entry = getEntry(file)
        const blob = entry.value.blob
        if (!blob || file.size === 0) return true
        try {
          const cached = await fixedContentCore.has(blob.blockOffset, blob.blockOffset + blob.blockLength)
          assertContentIdentity()
          if (!cached) return false
          // blockMap 文件还会引用映射之外的内容块，以纯本地流验证，绝不补拉网络数据。
          if (blob.blockMap) {
            for await (const _ of createStream(file, undefined, true)) { /* 消费并验证本地块。 */ }
          }
          assertContentIdentity()
          return true
        } catch (error) {
          if (versionError) throw versionError
          if (controller.signal.aborted) throw canceled()
          if (normalizeFileReadError(error).status === 503) return false
          throw normalizeFileReadError(error)
        }
      },
      close: sessionClose,
    }
  } catch (error) {
    await close()
    throw normalizeFileReadError(error)
  }
}
