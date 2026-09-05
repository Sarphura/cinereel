import { createHash } from 'node:crypto'

export const PROTOCOL_DIRECTORY_PATH = '/.cinereel'
export const MAX_PROTOCOL_FILE_SIZE = 65_536

export function isReservedDrivePath(path: string): boolean {
  return path === PROTOCOL_DIRECTORY_PATH || path.startsWith(`${PROTOCOL_DIRECTORY_PATH}/`)
}

export function createFileEtag(driveKey: string, driveFork: number, sequence: number, path: string, contentFork: number | null): string {
  // entry 序号与两条历史的 fork 标识一次写入，正文独立截断也会使 ETag 改变。
  return `"${createHash('sha256').update(`${driveKey}:${driveFork}:${sequence}:${path}:${contentFork}`).digest('hex')}"`
}

export type ProtocolWriteCondition = { ifNoneMatch: '*' } | { ifMatch: string }

export type ProtocolFileVersion = {
  etag: string
  driveVersion: number
}

export type ProtocolFile = ProtocolFileVersion & { content: Buffer }
export type ProtocolWriteResult = ProtocolFileVersion & { created: boolean }
