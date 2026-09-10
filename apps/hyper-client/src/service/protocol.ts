import { createHash } from 'node:crypto'

// Cinereel 文件协议的硬性常量集中定义。
// 这些是协议常量（跨实例必须一致），不可由部署配置覆盖，见 ADR-0007。

// 保留目录（协议固定路径，随 Drive 内容复制）。
export const RESERVED_DIRECTORY_PATH = '/.cinereel'
export const MAX_RESERVED_FILE_SIZE = 65_536

// Drive 文件协议约束。
export const DRIVE_KEY_PATTERN = /^[0-9a-f]{64}$/iu
export const MAX_DRIVE_FILE_PATH_LENGTH = 1024
export const MAX_DRIVE_FILE_SIZE = 500 * 1024 * 1024
export const DEFAULT_DIRECTORY_PAGE_SIZE = 100
export const MAX_DIRECTORY_PAGE_SIZE = 500

export function isReservedDrivePath(path: string): boolean {
  return path === RESERVED_DIRECTORY_PATH || path.startsWith(`${RESERVED_DIRECTORY_PATH}/`)
}

export function createFileEtag(driveKey: string, driveFork: number, sequence: number, path: string, contentFork: number | null): string {
  // entry 序号与两条历史的 fork 标识一次写入，正文独立截断也会使 ETag 改变。
  return `"${createHash('sha256').update(`${driveKey}:${driveFork}:${sequence}:${path}:${contentFork}`).digest('hex')}"`
}

export type ReservedFileWriteCondition = { ifNoneMatch: '*' } | { ifMatch: string }

export type ReservedFileVersion = {
  etag: string
  driveVersion: number
}

export type ReservedFile = ReservedFileVersion & { content: Buffer }
export type ReservedFileWriteResult = ReservedFileVersion & { created: boolean }

