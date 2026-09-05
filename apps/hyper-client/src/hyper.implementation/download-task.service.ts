import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { FileService } from './file.service.js'
import { DriveActivity } from '../hyper.infrastructure/sdk/drive-activity.js'
import { GetConfigPath } from '../hyper.infrastructure/sdk/hyper-sdk.module.js'
import { DownloadTaskStore } from './download-task.store.js'
import {
  DownloadRequestSchema,
  DownloadTaskError,
  isReservedDownload,
  type DownloadRequest,
  type DownloadTaskResponse,
  type StoredDownloadTask,
} from './download-task.types.js'

export { DownloadTaskError } from './download-task.types.js'

export type DownloadTaskOptions = {
  storagePath?: string
  concurrency?: number
  timeoutMs?: number
  retryDelaysMs?: number[]
  store?: DownloadTaskStore
}

type ReadSession = Awaited<ReturnType<FileService['openReadSession']>>
type FileDescriptor = Awaited<ReturnType<ReadSession['getFile']>>
type Worker = {
  controller: AbortController
  promise: Promise<void>
  currentPath: string | null
  currentBytes: number
}

function abortError(): Error {
  return new DOMException('任务读取已经中止。', 'AbortError')
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError()
}

function sameRequest(left: DownloadRequest, right: DownloadRequest): boolean {
  return left.driveKey === right.driveKey && left.path === right.path &&
    left.targetType === right.targetType && left.driveVersion === right.driveVersion
}

function failure(error: unknown): { code: string; message: string; retryable: boolean } {
  const value = error as { status?: number; code?: string; message?: string; cause?: unknown }
  const code = value?.code ?? 'download-failed'
  const permanentCodes = new Set([
    'version-unavailable', 'storage-error', 'ENOSPC', 'EIO', 'EROFS', 'EACCES', 'EPERM', 'EDQUOT',
  ])
  let permanent = false
  let cause: unknown = error
  for (let depth = 0; depth < 5 && cause && typeof cause === 'object'; depth += 1) {
    const current = cause as { code?: string; cause?: unknown }
    if (current.code && permanentCodes.has(current.code)) permanent = true
    cause = current.cause
  }
  return {
    code,
    message: value?.message ?? '离线下载失败。',
    retryable: !permanent && (value?.status === 503 || value?.status === 504 ||
      ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'REQUEST_TIMEOUT',
        'BLOCK_NOT_AVAILABLE', 'download-timeout'].includes(code)),
  }
}

@Injectable()
export class DownloadTaskService implements OnModuleInit, OnModuleDestroy {
  private readonly store: DownloadTaskStore
  private readonly concurrency: number
  private readonly timeoutMs: number
  private readonly retryDelaysMs: number[]
  private tasks = new Map<string, StoredDownloadTask>()
  private readonly reservations = new Map<string, () => void>()
  private readonly workers = new Map<string, Worker>()
  private readonly controls = new Map<string, Promise<unknown>>()
  private readonly suppressed = new Set<string>()
  private writeQueue: Promise<unknown> = Promise.resolve()
  private timer: ReturnType<typeof setTimeout> | undefined
  private stopping = false
  private started = false
  private storageFailure: unknown

  constructor(
    private readonly files: FileService,
    private readonly activity: DriveActivity,
    options: DownloadTaskOptions = {},
  ) {
    this.store = options.store ?? new DownloadTaskStore(
      options.storagePath ?? resolve(GetConfigPath(), 'download-tasks.json'),
    )
    this.concurrency = options.concurrency ?? 2
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.retryDelaysMs = options.retryDelaysMs ?? [1_000, 5_000, 30_000]
    if (!Number.isInteger(this.concurrency) || this.concurrency < 1 ||
        this.timeoutMs <= 0 || this.retryDelaysMs.some((delay) => delay < 0)) {
      throw new TypeError('离线任务调度配置无效。')
    }
  }

  async onModuleInit(): Promise<void> {
    const tasks = await this.store.read()
    try {
      for (const task of tasks) {
        if (task.status === 'running') {
          task.status = 'queued'
          task.updatedAt = new Date().toISOString()
        }
        if (isReservedDownload(task.status)) {
          this.reservations.set(task.id, this.activity.acquire(task.request.driveKey))
        }
        this.tasks.set(task.id, task)
      }
      if (tasks.length > 0) await this.store.write(tasks)
      this.started = true
      this.schedule()
    } catch (error) {
      for (const release of this.reservations.values()) release()
      this.reservations.clear()
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true
    clearTimeout(this.timer)
    for (const worker of this.workers.values()) worker.controller.abort()
    await Promise.allSettled([
      ...[...this.workers.values()].map((worker) => worker.promise),
      ...this.controls.values(), this.writeQueue,
    ])
    await this.writeQueue.catch(() => undefined)
    try {
      if (this.started && !this.storageFailure) {
        await this.change((tasks) => {
          for (const task of tasks.values()) {
            if (task.status === 'running') {
              task.status = 'queued'
              task.updatedAt = new Date().toISOString()
            }
          }
        }, true)
      }
    } catch (error) {
      this.storageFailure = error
    } finally {
      for (const release of this.reservations.values()) release()
      this.reservations.clear()
      this.started = false
    }
    if (this.storageFailure) {
      console.error('[DownloadTaskService] 关闭时无法保存任务，将从最后持久化状态恢复：', this.storageFailure)
    }
  }

  async createTask(input: DownloadRequest, idempotencyKey: string): Promise<DownloadTaskResponse> {
    const parsed = DownloadRequestSchema.safeParse(input)
    if (!parsed.success || !/^[\x21-\x7e]{1,200}$/u.test(idempotencyKey)) {
      throw new DownloadTaskError(400, 'invalid-request', '任务参数或 Idempotency-Key 无效。')
    }
    let release: (() => void) | undefined
    let createdId: string | undefined
    let taskId = ''
    try {
      await this.change((tasks) => {
        const existing = [...tasks.values()].find((task) => task.idempotencyKey === idempotencyKey)
        if (existing) {
          if (!sameRequest(existing.request, parsed.data)) {
            throw new DownloadTaskError(409, 'idempotency-conflict', '幂等键已经用于不同任务参数。')
          }
          taskId = existing.id
          return
        }
        release = this.activity.acquire(parsed.data.driveKey)
        taskId = randomUUID()
        createdId = taskId
        const now = new Date().toISOString()
        tasks.set(taskId, {
          id: taskId, idempotencyKey, request: parsed.data,
          driveVersion: null, driveFork: null, contentFork: null, status: 'queued',
          totalFiles: null, totalBytes: null, completedFiles: 0, completedBytes: 0,
          skippedEntries: 0, lastCompletedPath: null, retryCount: 0, nextRetryAt: null,
          error: null, createdAt: now, updatedAt: now,
        })
      })
      if (createdId && release) this.reservations.set(createdId, release)
    } catch (error) {
      release?.()
      throw error
    }
    const response = this.getTask(taskId)
    this.schedule()
    return response
  }

  getTask(id: string): DownloadTaskResponse {
    const task = this.requireTask(this.tasks, id)
    const worker = this.workers.get(id)
    return {
      id: task.id, ...task.request,
      driveVersion: task.driveVersion, driveFork: task.driveFork,
      contentFork: task.contentFork, status: task.status,
      totalFiles: task.totalFiles, totalBytes: task.totalBytes,
      processedFiles: task.completedFiles,
      processedBytes: task.completedBytes + (task.status === 'running' &&
        worker?.currentPath !== task.lastCompletedPath ? worker?.currentBytes ?? 0 : 0),
      skippedEntries: task.skippedEntries,
      currentPath: task.status === 'running' ? worker?.currentPath ?? null : null,
      retryCount: task.retryCount, nextRetryAt: task.nextRetryAt,
      error: task.error ? { ...task.error } : null,
      createdAt: task.createdAt, updatedAt: task.updatedAt,
    }
  }

  listTasks(cursor?: string, limit = 100): { tasks: DownloadTaskResponse[]; nextCursor: string | null } {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new DownloadTaskError(400, 'invalid-limit', 'limit 必须在 1 到 500 之间。')
    }
    const ids = [...this.tasks.keys()]
    const index = cursor === undefined ? -1 : ids.indexOf(cursor)
    if (cursor !== undefined && index < 0) {
      throw new DownloadTaskError(400, 'invalid-cursor', '任务游标不存在。')
    }
    const page = ids.slice(index + 1, index + 1 + limit)
    return {
      tasks: page.map((id) => this.getTask(id)),
      nextCursor: index + 1 + limit < ids.length ? page.at(-1)! : null,
    }
  }

  pauseTask(id: string): Promise<DownloadTaskResponse> {
    return this.control(id, async () => {
      const task = this.requireTask(this.tasks, id)
      if (task.status === 'paused') return this.getTask(id)
      if (task.status !== 'queued' && task.status !== 'running') this.invalidTransition()
      await this.stopWorker(id)
      await this.updateTask(id, (current) => {
        if (current.status !== 'queued' && current.status !== 'running') this.invalidTransition()
        current.status = 'paused'
      })
      return this.getTask(id)
    })
  }

  resumeTask(id: string): Promise<DownloadTaskResponse> {
    return this.control(id, async () => {
      const task = this.requireTask(this.tasks, id)
      if (task.status === 'queued' || task.status === 'running') return this.getTask(id)
      if (task.status !== 'paused') this.invalidTransition()
      await this.updateTask(id, (current) => { current.status = 'queued' })
      return this.getTask(id)
    })
  }

  cancelTask(id: string): Promise<DownloadTaskResponse> {
    return this.control(id, async () => {
      const task = this.requireTask(this.tasks, id)
      if (task.status === 'canceled') return this.getTask(id)
      if (task.status === 'completed') this.invalidTransition()
      await this.stopWorker(id)
      await this.updateTask(id, (current) => {
        if (current.status === 'completed') this.invalidTransition()
        current.status = 'canceled'
        current.nextRetryAt = null
      })
      this.releaseReservation(id)
      return this.getTask(id)
    })
  }

  retryTask(id: string): Promise<DownloadTaskResponse> {
    return this.control(id, async () => {
      const task = this.requireTask(this.tasks, id)
      if (task.status !== 'failed') this.invalidTransition()
      const release = this.activity.acquire(task.request.driveKey)
      try {
        await this.updateTask(id, (current) => {
          current.status = 'queued'
          current.retryCount = 0
          current.nextRetryAt = null
          current.error = null
        })
        this.reservations.set(id, release)
      } catch (error) {
        release()
        throw error
      }
      return this.getTask(id)
    })
  }

  private control(id: string, operation: () => Promise<DownloadTaskResponse>): Promise<DownloadTaskResponse> {
    const previous = this.controls.get(id) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(async () => {
      this.assertAvailable()
      this.suppressed.add(id)
      try { return await operation() } finally { this.suppressed.delete(id) }
    })
    this.controls.set(id, next)
    void next.finally(() => {
      if (this.controls.get(id) === next) this.controls.delete(id)
      this.schedule()
    }).catch(() => undefined)
    return next
  }

  private async stopWorker(id: string): Promise<void> {
    const worker = this.workers.get(id)
    if (!worker) return
    worker.controller.abort()
    await worker.promise
  }

  private schedule(): void {
    clearTimeout(this.timer)
    if (!this.started || this.stopping || this.storageFailure) return
    let nextRetry = Infinity
    for (const task of this.tasks.values()) {
      if (task.status !== 'queued' || this.workers.has(task.id) || this.suppressed.has(task.id)) continue
      const retryAt = task.nextRetryAt === null ? 0 : Date.parse(task.nextRetryAt)
      if (retryAt > Date.now()) {
        nextRetry = Math.min(nextRetry, retryAt)
        continue
      }
      if (this.workers.size >= this.concurrency) continue
      const worker: Worker = {
        controller: new AbortController(), promise: Promise.resolve(), currentPath: null, currentBytes: 0,
      }
      this.workers.set(task.id, worker)
      worker.promise = this.run(task.id, worker).catch((error) => {
        this.storageFailure = error
        for (const running of this.workers.values()) running.controller.abort()
        console.error('[DownloadTaskService] 任务状态无法持久化，已停止调度：', error)
      }).finally(() => {
        this.workers.delete(task.id)
        this.schedule()
      })
    }
    if (Number.isFinite(nextRetry)) {
      this.timer = setTimeout(() => this.schedule(), Math.max(1, nextRetry - Date.now()))
      this.timer.unref()
    }
  }

  private async run(id: string, worker: Worker): Promise<void> {
    const signal = worker.controller.signal
    let session: ReadSession | undefined
    try {
      await this.updateTask(id, (task) => {
        assertNotAborted(signal)
        task.status = 'running'
        task.nextRetryAt = null
        task.error = null
      })
      let task = this.requireTask(this.tasks, id)
      session = await this.files.openReadSession(task.request.driveKey, {
        driveVersion: task.driveVersion ?? task.request.driveVersion,
        driveFork: task.driveFork ?? undefined,
        contentFork: task.contentFork ?? undefined,
        timeoutMs: this.timeoutMs, signal,
      })
      assertNotAborted(signal)
      if (task.driveVersion === null) {
        await this.updateTask(id, (current) => {
          assertNotAborted(signal)
          current.driveVersion = session!.driveVersion
          current.driveFork = session!.driveFork
        })
      }
      const contentFork = await session.prepareContent()
      assertNotAborted(signal)
      if (task.contentFork !== null && task.contentFork !== contentFork) {
        throw new DownloadTaskError(503, 'version-unavailable', '原正文版本已经不可用。')
      }
      if (task.contentFork === null) {
        await this.updateTask(id, (current) => {
          assertNotAborted(signal)
          current.contentFork = contentFork
        })
      }

      let totalFiles = 0
      let totalBytes = 0
      let skippedEntries = 0
      let entryCount = 0
      let verifiedFiles = 0
      let verifiedBytes = 0
      let verifiedPath: string | null = null
      let checkpointValid = true
      task = this.requireTask(this.tasks, id)
      const checkpoint = task.lastCompletedPath
      for await (const file of this.enumerate(session, task.request)) {
        assertNotAborted(signal)
        entryCount += 1
        if (file.type === 'symlink') { skippedEntries += 1; continue }
        if (file.size > 0 && contentFork === null) {
          throw new DownloadTaskError(503, 'version-unavailable', '未能确认非空文件的正文版本。')
        }
        totalFiles += 1
        totalBytes += file.size
        if (checkpointValid && checkpoint !== null &&
            Buffer.compare(Buffer.from(file.path), Buffer.from(checkpoint)) <= 0) {
          if (await session.hasFile(file)) {
            verifiedFiles += 1
            verifiedBytes += file.size
            verifiedPath = file.path
          } else {
            checkpointValid = false
          }
        }
      }
      if (entryCount === 0 && task.request.path !== '/') {
        throw new DownloadTaskError(404, 'not-found', '任务目标路径不存在。')
      }
      await this.updateTask(id, (current) => {
        assertNotAborted(signal)
        Object.assign(current, {
          totalFiles, totalBytes, skippedEntries,
          completedFiles: verifiedFiles, completedBytes: verifiedBytes, lastCompletedPath: verifiedPath,
        })
      })

      for await (const file of this.enumerate(session, task.request)) {
        assertNotAborted(signal)
        if (file.type === 'symlink' || (verifiedPath !== null &&
            Buffer.compare(Buffer.from(file.path), Buffer.from(verifiedPath)) <= 0)) continue
        worker.currentPath = file.path
        worker.currentBytes = 0
        await this.consume(session, file, worker)
        assertNotAborted(signal)
        if (!(await session.hasFile(file))) {
          throw new DownloadTaskError(503, 'cache-incomplete', '文件读取结束后缓存仍不完整。')
        }
        await this.updateTask(id, (current) => {
          assertNotAborted(signal)
          current.completedFiles += 1
          current.completedBytes += file.size
          current.lastCompletedPath = file.path
        })
        worker.currentBytes = 0
        worker.currentPath = null
      }
      await this.updateTask(id, (current) => {
        assertNotAborted(signal)
        current.status = 'completed'
        current.error = null
      })
      this.releaseReservation(id)
    } catch (error) {
      if (signal.aborted) return
      const result = failure(error)
      try {
        await this.updateTask(id, (task) => {
          assertNotAborted(signal)
          task.error = { code: result.code, message: result.message }
          if (result.retryable && task.retryCount < this.retryDelaysMs.length) {
            task.nextRetryAt = new Date(Date.now() + this.retryDelaysMs[task.retryCount]!).toISOString()
            task.retryCount += 1
            task.status = 'queued'
          } else {
            task.status = 'failed'
            task.nextRetryAt = null
          }
        })
      } catch (persistenceError) {
        if (signal.aborted) return
        throw persistenceError
      }
      if (this.requireTask(this.tasks, id).status === 'failed') this.releaseReservation(id)
    } finally {
      await session?.close()
    }
  }

  private async *enumerate(session: ReadSession, request: DownloadRequest): AsyncIterable<FileDescriptor> {
    if (request.targetType === 'directory') {
      yield* session.entries(request.path)
      return
    }
    const file = await session.getFile(request.path)
    if (file.type === 'symlink') {
      throw new DownloadTaskError(422, 'unsupported-entry', '单文件任务不支持符号链接。')
    }
    yield file
  }

  private async consume(session: ReadSession, file: FileDescriptor, worker: Worker): Promise<void> {
    const source = session.createReadStream(file)
    let timer: ReturnType<typeof setTimeout>
    const resetTimeout = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        source.destroy(new DownloadTaskError(504, 'download-timeout', '等待文件内容超时。'))
      }, this.timeoutMs)
      timer.unref()
    }
    const sink = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        worker.currentBytes += chunk.byteLength
        resetTimeout()
        callback()
      },
    })
    resetTimeout()
    try {
      await pipeline(source, sink, { signal: worker.controller.signal })
      if (worker.currentBytes !== file.size) {
        throw new DownloadTaskError(503, 'incomplete-content', '读取字节数与文件元数据不一致。')
      }
    } finally {
      clearTimeout(timer!)
    }
  }

  private requireTask(tasks: Map<string, StoredDownloadTask>, id: string): StoredDownloadTask {
    const task = tasks.get(id)
    if (!task) throw new DownloadTaskError(404, 'task-not-found', '离线任务不存在。')
    return task
  }

  private invalidTransition(): never {
    throw new DownloadTaskError(409, 'invalid-task-state', '当前任务状态不支持该操作。')
  }

  private releaseReservation(id: string): void {
    this.reservations.get(id)?.()
    this.reservations.delete(id)
  }

  private updateTask(id: string, update: (task: StoredDownloadTask) => void): Promise<void> {
    return this.change((tasks) => {
      const task = this.requireTask(tasks, id)
      update(task)
      task.updatedAt = new Date().toISOString()
    })
  }

  private assertAvailable(): void {
    if (this.stopping || this.storageFailure) {
      throw new DownloadTaskError(503, 'task-service-unavailable', '离线任务服务暂不可用。')
    }
  }

  private change(update: (tasks: Map<string, StoredDownloadTask>) => void, shutdown = false): Promise<void> {
    const operation = this.writeQueue.catch(() => undefined).then(async () => {
      if (!shutdown) this.assertAvailable()
      const tasks = structuredClone(this.tasks)
      update(tasks)
      try {
        await this.store.write([...tasks.values()])
      } catch (error) {
        this.storageFailure = error
        for (const worker of this.workers.values()) worker.controller.abort()
        throw error
      }
      this.tasks = tasks
    })
    this.writeQueue = operation
    return operation
  }
}
