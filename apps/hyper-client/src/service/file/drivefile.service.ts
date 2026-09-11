import { SDK } from "hyper-sdk"
import { z } from 'zod'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { isDriveDirectoryPath, isDriveFilePath } from '../file.service.js'
import { DRIVE_KEY_PATTERN, isReservedDrivePath } from "../protocol.js"

const driveKeySchema = z.string().regex(DRIVE_KEY_PATTERN, 'driveKey 必须是 64 位十六进制字符串。')
const filePathSchema = z.string().refine(isDriveFilePath, 'path 必须是规范的 Drive 绝对文件路径。')
const directoryPathSchema = z.string().refine(isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对目录路径。')

// 业务异常：service 层只负责抛出，HTTP 形态（状态码/响应体）由全局 DriveFileExceptionFilter 决定。
export class DriveFileError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'DriveFileError'
  }
}

export class DriveFileService {

  constructor(
    private readonly sdk: SDK,
  ) {}

  async addFile(
    driveKey: string,
    path: string,
    content: Readable,
  ): Promise<boolean> {
    // 1. 参数校验：入参非法直接抛 ZodError，属于框架级错误，交给 Nest 默认过滤器。
    driveKeySchema.parse(driveKey)
    filePathSchema.parse(path)

    // 正文（HTTP 请求体）只能被消费一次：在交给 pipeline 之前就失败时，
    // 必须显式丢弃剩余正文，否则调用方还在上传正文，本端已经回了响应。
    // 不要改成 content.destroy()：destroy 会 RST 连接，调用方拿到的是
    // ECONNRESET 而不是 403/409，响应体永远送不出去（同 protocol-file.controller 的既有约定）。
    let handedOff = false
    try {
      const drive = await this.sdk.getDrive(driveKey)

      // 2. 业务失败一律抛 DriveFileError，不再作为返回值向上传递。
      if (!drive.writable) {
        throw new DriveFileError('drive-not-writable', 403, '当前 Hyper Client 没有该 Drive 的写权限。')
      }

      const existing = await drive.entry(path, { wait: false })
      if (existing !== null) {
        throw new DriveFileError('already-exists', 409, '目标路径已经存在。')
      }

      // 3. 成功路径：写入正文后返回成功标记。
      const sink = drive.createWriteStream(path)
      handedOff = true
      await pipeline(content, sink)
      return true
    } finally {
      // 交出后正文由 pipeline 负责销毁；只有未交出时才由这里丢弃。
      // 丢弃会触发 abort/ECONNRESET 之类的流错误，先吞掉，避免 unhandled 'error' 打崩进程。
      if (!handedOff) {
        content.on('error', () => { /* 丢弃正文阶段的错误无需上报 */ })
        content.resume()
      }
    }
  }

  async deleteFile(
    driveKey: string,
    path: string,
  ): Promise<boolean> {

    // 1. 参数校验：入参非法直接抛 ZodError，属于框架级错误，交给 Nest 默认过滤器。
    driveKeySchema.parse(driveKey)
    filePathSchema.parse(path)
    
    const drive = await this.sdk.getDrive(driveKey)

      if (!drive.writable) {
        throw new DriveFileError('drive-not-writable', 403, '当前 Hyper Client 没有该 Drive 的写权限。')
      }

      const existing = await drive.entry(path, { wait: false })
      if (existing === null) {
        throw new DriveFileError('not-found', 404, '指定的文件不存在。')
      }

      await drive.del(path)
      return true
  }
}
