import { Readable, Transform } from 'node:stream'
import { FileReadError, type ReadFileDescriptor } from './file-read.js'

// 单段 bytes 范围的解析结果。resolveByteRange 将 HTTP Range/If-Range 语义抽成纯函数，
// 不依赖 Express，既便于单测，也把字节范围协议与传输层解耦。
export type ByteRange = { start: number; end: number }

export type ResolvedRange = {
  range?: ByteRange
  unsatisfiable: boolean
}

export type FileReadStatusCode = 200 | 206 | 416

export type FileReadRequest = {
  driveVersion?: number
  rawRange?: string
  ifRange?: string
  signal?: AbortSignal
}

// 一次文件读取的完整产物：元数据 + 惰性打开的校验流 + 会话关闭。
export interface FileReadResponse {
  readonly file: ReadFileDescriptor
  readonly driveVersion: number
  readonly status: FileReadStatusCode
  readonly range: ByteRange | undefined
  readonly expectedBytes: number
  openStream(): Readable
  close(): Promise<void>
}

// 仅接受单段 bytes 范围：bytes=START-END、bytes=START-、bytes=-SUFFIX。
// 多段、未知单位、非法格式一律当作「无范围」，与旧行为一致。
const SINGLE_RANGE_PATTERN = /^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$/u

export function resolveByteRange(
  rawRange: string | undefined,
  ifRange: string | undefined,
  etag: string,
  size: number,
): ResolvedRange {
  if (
    rawRange === undefined ||
    (ifRange !== undefined && ifRange !== etag) ||
    !SINGLE_RANGE_PATTERN.test(rawRange)
  ) {
    return { unsatisfiable: false }
  }

  const spec = rawRange.slice('bytes='.length)

  if (spec.startsWith('-')) {
    // 后缀范围 bytes=-SUFFIX
    const suffix = Number(spec.slice(1))
    // range-parser 对「后缀长度 >= 文件大小」返回 -1，HTTP 规定此时返回完整范围。
    if (size > 0 && suffix >= size) {
      return { range: { start: 0, end: size - 1 }, unsatisfiable: false }
    }
    const start = size - suffix
    if (start < 0 || start > size - 1) {
      return { unsatisfiable: true }
    }
    return { range: { start, end: size - 1 }, unsatisfiable: false }
  }

  // 显式范围 bytes=START-END 或 bytes=START-
  const [startStr, endStr] = spec.split('-')
  const start = Number(startStr)
  let end = endStr === '' ? size - 1 : Number(endStr)
  if (end > size - 1) end = size - 1
  if (start < 0 || start > end) {
    return { unsatisfiable: true }
  }
  return { range: { start, end }, unsatisfiable: false }
}

// 包装读取流：校验字节数既不超过也不短于声明长度，保证 Content-Length 契约成立。
export function createLengthCheckingStream(source: Readable, expectedBytes: number): Readable {
  let writtenBytes = 0
  const checker = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      writtenBytes += Buffer.byteLength(chunk)
      if (writtenBytes > expectedBytes) {
        callback(new FileReadError('content-unavailable', 503, '文件内容超过声明的长度。'))
        return
      }
      callback(null, chunk)
    },
    flush(callback) {
      if (writtenBytes !== expectedBytes) {
        callback(new FileReadError('content-unavailable', 503, '文件内容短于声明的长度。'))
        return
      }
      callback()
    },
  })
  // 源流错误（缺块/超时）传导到校验流；校验流销毁或结束时回收源流，避免半开流泄漏。
  source.on('error', (error) => checker.destroy(error))
  checker.on('close', () => source.destroy())
  source.pipe(checker)
  return checker
}
