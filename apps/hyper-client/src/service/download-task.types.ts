import { z } from 'zod'
import { isDriveDirectoryPath, isDriveFilePath } from './file.service.js'

export const DownloadRequestSchema = z.object({
  driveKey: z.string().regex(/^[0-9a-f]{64}$/iu).transform((key) => key.toLowerCase()),
  path: z.string().max(1024).refine(isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对路径。'),
  targetType: z.enum(['file', 'directory']),
  driveVersion: z.number().int().min(1).optional(),
}).strict().refine(
  (request) => request.targetType !== 'file' || isDriveFilePath(request.path),
  '单文件任务必须提供文件路径。',
)

export type DownloadRequest = z.infer<typeof DownloadRequestSchema>
export const DownloadStatusSchema = z.enum([
  'queued', 'running', 'paused', 'completed', 'failed', 'canceled',
])
export type DownloadStatus = z.infer<typeof DownloadStatusSchema>
export const DownloadErrorSchema = z.object({ code: z.string(), message: z.string() }).strict()

export const StoredDownloadTaskSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200),
  request: DownloadRequestSchema,
  driveVersion: z.number().int().min(1).nullable(),
  driveFork: z.number().int().nonnegative().nullable(),
  contentFork: z.number().int().nonnegative().nullable(),
  status: DownloadStatusSchema,
  totalFiles: z.number().int().nonnegative().nullable(),
  totalBytes: z.number().int().nonnegative().nullable(),
  completedFiles: z.number().int().nonnegative(),
  completedBytes: z.number().int().nonnegative(),
  skippedEntries: z.number().int().nonnegative(),
  lastCompletedPath: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  nextRetryAt: z.string().datetime().nullable(),
  error: DownloadErrorSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((task, context) => {
  const invalid = (message: string) => context.addIssue({ code: 'custom', message })
  if ((task.driveVersion === null) !== (task.driveFork === null)) {
    invalid('固定版本与 fork 必须同时存在。')
  }
  if (task.contentFork !== null && task.driveVersion === null) {
    invalid('固定正文 fork 前必须先固定元数据版本。')
  }
  if (task.contentFork === null && ((task.totalBytes ?? 0) > 0 || task.completedBytes > 0)) {
    invalid('非空正文的任务统计必须绑定已确认的正文 fork。')
  }
  if ((task.totalFiles === null) !== (task.totalBytes === null) ||
      (task.totalFiles !== null && task.completedFiles > task.totalFiles) ||
      (task.totalBytes !== null && task.completedBytes > task.totalBytes)) {
    invalid('任务统计与完整文件 checkpoint 不一致。')
  }
  if ((task.completedFiles === 0) !== (task.lastCompletedPath === null) ||
      (task.completedFiles === 0 && task.completedBytes !== 0)) {
    invalid('完整文件数量与 checkpoint 路径不一致。')
  }
  if (task.lastCompletedPath !== null && (!isDriveFilePath(task.lastCompletedPath) ||
      (task.request.targetType === 'file' ? task.lastCompletedPath !== task.request.path :
        task.request.path !== '/' && !task.lastCompletedPath.startsWith(`${task.request.path}/`)))) {
    invalid('checkpoint 路径不属于任务目标。')
  }
  if (task.driveVersion === null && (task.totalFiles !== null || task.completedFiles !== 0)) {
    invalid('尚未固定版本的任务不能包含下载统计。')
  }
  if (task.driveVersion !== null && task.request.driveVersion !== undefined &&
      task.driveVersion !== task.request.driveVersion) {
    invalid('固定版本必须与指定版本一致。')
  }
  if (task.status === 'completed' && (task.driveVersion === null ||
      task.totalFiles === null || task.totalBytes === null ||
      task.completedFiles !== task.totalFiles || task.completedBytes !== task.totalBytes)) {
    invalid('完成状态必须具有完整的固定版本统计。')
  }
  if (task.nextRetryAt !== null && task.status !== 'queued' && task.status !== 'paused') {
    invalid('只有排队或暂停任务可以保留自动重试时间。')
  }
})
export type StoredDownloadTask = z.infer<typeof StoredDownloadTaskSchema>

export const DownloadTaskResponseSchema = z.object({
  id: z.string().uuid(),
  driveKey: z.string(),
  path: z.string(),
  targetType: z.enum(['file', 'directory']),
  driveVersion: z.number().int().nullable(),
  driveFork: z.number().int().nullable(),
  contentFork: z.number().int().nullable().describe('已确认的正文存储 fork；尚未准备或空正文版本时为 null。'),
  status: DownloadStatusSchema,
  totalFiles: z.number().int().nullable(),
  totalBytes: z.number().int().nullable(),
  processedFiles: z.number().int(),
  processedBytes: z.number().int().describe('已确认文件字节与当前文件读取字节之和，包含本地缓存，不是网络流量。'),
  skippedEntries: z.number().int(),
  currentPath: z.string().nullable(),
  retryCount: z.number().int(),
  nextRetryAt: z.string().datetime().nullable(),
  error: DownloadErrorSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type DownloadTaskResponse = z.infer<typeof DownloadTaskResponseSchema>

export class DownloadTaskError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'DownloadTaskError'
  }
}

export function isReservedDownload(status: DownloadStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'paused'
}
