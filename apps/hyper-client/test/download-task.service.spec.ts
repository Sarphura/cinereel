import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { DownloadTaskService } from '../src/hyper.implementation/download-task.service.js'
import { DownloadTaskStore } from '../src/hyper.implementation/download-task.store.js'
import { DownloadTaskError } from '../src/hyper.implementation/download-task.types.js'
import type { FileService } from '../src/hyper.implementation/file.service.js'
import { DriveActivity } from '../src/hyper.infrastructure/sdk/drive-activity.js'

const driveKey = 'a'.repeat(64)
const input = { driveKey, path: '/', targetType: 'directory' as const }
type Descriptor = { path: string; type: 'file' | 'symlink'; size: number; etag: string }

function fakeFiles(contents: Record<string, string> = { '/a.txt': 'alpha', '/b.txt': 'beta' }) {
  const cached = new Set<string>()
  const descriptors = Object.entries(contents).map(([path, content]) => ({
    path, type: 'file' as const, size: Buffer.byteLength(content), etag: path,
  })).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))) as Descriptor[]
  const streams: Readable[] = []
  let stalled = false
  let streamError: Error | undefined
  let hasCached = true
  let contentFork: number | null = 0
  let preparedContentFork: number | null = null
  const prepareContent = vi.fn(async () => {
    preparedContentFork = contentFork
    return contentFork
  })
  const close = vi.fn(async () => undefined)
  const createReadStream = vi.fn((file: Descriptor) => {
    const stream = stalled ? new Readable({ read() {} }) :
      streamError ? new Readable({ read() { this.destroy(streamError) } }) :
        Readable.from([Buffer.from(contents[file.path] ?? '')])
    stream.once('end', () => cached.add(file.path))
    streams.push(stream)
    return stream
  })
  const entries = vi.fn(async function* (path: string) {
    for (const file of descriptors) if (path === '/' || file.path.startsWith(`${path}/`)) yield file
  })
  const openReadSession = vi.fn(async (_key: string, _options?: unknown) => ({
    driveVersion: 7, driveFork: 0,
    get contentFork() { return preparedContentFork },
    prepareContent,
    getFile: async (path: string) => {
      const entry = descriptors.find((file) => file.path === path)
      if (!entry) throw new DownloadTaskError(404, 'not-found', '文件不存在。')
      return entry
    },
    entries,
    createReadStream,
    hasFile: async (file: Descriptor) => hasCached && cached.has(file.path),
    close,
  }))
  return {
    service: { openReadSession } as unknown as FileService,
    openReadSession, prepareContent, entries, createReadStream, close, descriptors, streams, cached,
    stall(value = true) { stalled = value },
    fail(error?: Error) { streamError = error },
    reportCache(value: boolean) { hasCached = value },
    changeContentFork(value: number | null) { contentFork = value },
  }
}

describe('DownloadTaskService', () => {
  let directory: string
  let storagePath: string
  let services: DownloadTaskService[]
  let activity: DriveActivity

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cinereel-downloads-'))
    storagePath = join(directory, 'download-tasks.json')
    services = []
    activity = new DriveActivity()
  })

  afterEach(async () => {
    for (const service of services) await service.onModuleDestroy().catch(() => undefined)
    await rm(directory, { recursive: true, force: true })
  })

  async function start(files = fakeFiles(), options = {}) {
    const service = new DownloadTaskService(files.service, activity, {
      storagePath, timeoutMs: 10_000, retryDelaysMs: [1, 2, 3], ...options,
    })
    await service.onModuleInit()
    services.push(service)
    return { service, files }
  }

  async function waitStatus(service: DownloadTaskService, id: string, status: string) {
    await vi.waitFor(() => expect(service.getTask(id).status).toBe(status), { timeout: 3_000, interval: 5 })
    return service.getTask(id)
  }

  it('创建先落盘，幂等重放相同任务，不同参数返回冲突', async () => {
    const { service, files } = await start()
    files.stall()
    const created = await service.createTask(input, 'request-1')
    const stored = await new DownloadTaskStore(storagePath).read()
    expect(stored[0]?.id).toBe(created.id)
    expect((await service.createTask(input, 'request-1')).id).toBe(created.id)
    await expect(service.createTask({ ...input, path: '/other' }, 'request-1'))
      .rejects.toMatchObject({ status: 409, code: 'idempotency-conflict' })
    expect(service.listTasks().tasks).toHaveLength(1)
  })

  it('目录任务固定版本、流式缓存并报告内容字节，跳过符号链接', async () => {
    const { service, files } = await start()
    files.descriptors.push({ path: '/link', type: 'symlink', size: 0, etag: 'link' })
    const task = await service.createTask(input, 'directory')
    const completed = await waitStatus(service, task.id, 'completed')
    expect(completed).toMatchObject({
      driveVersion: 7, driveFork: 0, contentFork: 0, totalFiles: 2, processedFiles: 2,
      totalBytes: 9, processedBytes: 9, skippedEntries: 1,
    })
    expect(files.cached).toEqual(new Set(['/a.txt', '/b.txt']))
    expect(files.createReadStream).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(files.close).toHaveBeenCalledTimes(1))
  })

  it('等待真实正文 fork 并先持久化，再扫描文件及读取内容', async () => {
    const { service, files } = await start()
    files.changeContentFork(5)
    let confirm!: () => void
    const confirmed = new Promise<void>((resolve) => { confirm = resolve })
    files.prepareContent.mockImplementationOnce(async () => { await confirmed; return 5 })
    const task = await service.createTask(input, 'content-identity')
    await vi.waitFor(() => expect(files.prepareContent).toHaveBeenCalledTimes(1))
    expect(service.getTask(task.id)).toMatchObject({ driveVersion: 7, contentFork: null, totalBytes: null })
    expect(files.entries).not.toHaveBeenCalled()
    expect(files.createReadStream).not.toHaveBeenCalled()
    files.entries.mockImplementationOnce(async function* () {
      expect((await new DownloadTaskStore(storagePath).read())[0]?.contentFork).toBe(5)
      yield* files.descriptors
    })
    confirm()
    expect(await waitStatus(service, task.id, 'completed')).toMatchObject({ contentFork: 5, processedBytes: 9 })
  })

  it('空根目录和零字节文件正常完成，缺失目录失败', async () => {
    const { service } = await start(fakeFiles({ '/empty': '' }))
    const file = await service.createTask({ ...input, path: '/empty', targetType: 'file' }, 'empty-file')
    expect(await waitStatus(service, file.id, 'completed')).toMatchObject({ processedBytes: 0, processedFiles: 1 })
    const missing = await service.createTask({ ...input, path: '/missing' }, 'missing')
    expect(await waitStatus(service, missing.id, 'failed')).toMatchObject({ retryCount: 0, error: { code: 'not-found' } })
    await service.onModuleDestroy()
    services = []
    await rm(storagePath)
    const emptyFiles = fakeFiles({})
    emptyFiles.changeContentFork(null)
    const empty = await start(emptyFiles)
    const root = await empty.service.createTask(input, 'empty-root')
    expect(await waitStatus(empty.service, root.id, 'completed')).toMatchObject({ totalFiles: 0, processedBytes: 0, contentFork: null })
  })

  it('暂停等待流释放并保留 Drive reservation，继续与取消不会误报完成', async () => {
    const { service, files } = await start()
    files.stall()
    const task = await service.createTask(input, 'pause')
    await vi.waitFor(() => expect(files.streams).toHaveLength(1))
    expect((await service.pauseTask(task.id)).status).toBe('paused')
    expect(files.streams[0]?.destroyed).toBe(true)
    await expect(activity.withExclusive(driveKey, async () => undefined)).rejects.toMatchObject({ status: 409 })
    expect((await service.resumeTask(task.id)).status).toBe('queued')
    await vi.waitFor(() => expect(files.streams).toHaveLength(2))
    expect((await service.cancelTask(task.id)).status).toBe('canceled')
    expect(files.streams[1]?.destroyed).toBe(true)
    await expect(activity.withExclusive(driveKey, async () => undefined)).resolves.toBeUndefined()
    expect((await new DownloadTaskStore(storagePath).read())[0]?.status).toBe('canceled')
  })

  it('并发暂停和取消按命令顺序完成，取消后不能继续', async () => {
    const { service, files } = await start()
    files.stall()
    const task = await service.createTask(input, 'control-race')
    await vi.waitFor(() => expect(files.streams).toHaveLength(1))
    const paused = service.pauseTask(task.id)
    const canceled = service.cancelTask(task.id)
    expect((await paused).status).toBe('paused')
    expect((await canceled).status).toBe('canceled')
    await expect(service.resumeTask(task.id)).rejects.toMatchObject({ status: 409 })
  })

  it('暂停任务重启后遇正文独立截断直接失败，不能重绑新的正文 fork', async () => {
    const files = fakeFiles()
    files.changeContentFork(3)
    files.stall()
    const { service } = await start(files)
    const task = await service.createTask(input, 'paused-content-fork')
    await vi.waitFor(() => expect(files.streams).toHaveLength(1))
    expect((await service.pauseTask(task.id)).contentFork).toBe(3)
    await service.onModuleDestroy()
    services = []
    files.changeContentFork(4)
    const recovered = await start(files)
    await recovered.service.resumeTask(task.id)
    expect(await waitStatus(recovered.service, task.id, 'failed')).toMatchObject({
      contentFork: 3, retryCount: 0, error: { code: 'version-unavailable' },
    })
    expect(files.openReadSession.mock.calls.at(-1)?.[1]).toMatchObject({ contentFork: 3 })
    expect(files.streams).toHaveLength(1)
  })

  it('失败任务重试时拒绝不同正文 fork，原固定标识保持不变', async () => {
    const { service, files } = await start(fakeFiles(), { retryDelaysMs: [] })
    files.changeContentFork(6)
    files.fail(new DownloadTaskError(503, 'network-error', '网络不可用。'))
    const task = await service.createTask(input, 'failed-content-fork')
    expect(await waitStatus(service, task.id, 'failed')).toMatchObject({ contentFork: 6 })
    files.changeContentFork(7)
    files.fail()
    await service.retryTask(task.id)
    expect(await waitStatus(service, task.id, 'failed')).toMatchObject({
      contentFork: 6, retryCount: 0, error: { code: 'version-unavailable' },
    })
    expect(files.openReadSession.mock.calls.at(-1)?.[1]).toMatchObject({ contentFork: 6 })
    expect(files.createReadStream).toHaveBeenCalledTimes(1)
  })

  it('网络错误有限重试三次，手动重试保持版本与 fork', async () => {
    const { service, files } = await start()
    files.fail(new DownloadTaskError(503, 'remote-unavailable', '远端暂不可用。'))
    const task = await service.createTask(input, 'retry')
    expect(await waitStatus(service, task.id, 'failed')).toMatchObject({ retryCount: 3, driveVersion: 7 })
    expect(files.openReadSession).toHaveBeenCalledTimes(4)
    expect(files.openReadSession.mock.calls.slice(1).every((call) =>
      (call[1] as { driveVersion: number; driveFork: number }).driveVersion === 7 &&
      (call[1] as { driveVersion: number; driveFork: number }).driveFork === 0)).toBe(true)
    files.fail()
    await service.retryTask(task.id)
    expect(await waitStatus(service, task.id, 'completed')).toMatchObject({ retryCount: 0, processedBytes: 9 })
  })

  it('内容等待超时会销毁读取并使用有限重试预算', async () => {
    const { service, files } = await start(fakeFiles(), { timeoutMs: 10, retryDelaysMs: [1] })
    files.stall()
    const task = await service.createTask(input, 'timeout')
    expect(await waitStatus(service, task.id, 'failed')).toMatchObject({ retryCount: 1, error: { code: 'download-timeout' } })
    expect(files.streams).toHaveLength(2)
    expect(files.streams.every((stream) => stream.destroyed)).toBe(true)
  })

  it('原版本不可用和本地存储错误直接失败，不消耗网络重试', async () => {
    const { service, files } = await start()
    for (const code of ['version-unavailable', 'storage-error', 'ENOSPC']) {
      files.fail(new DownloadTaskError(503, code, '不能完成读取。'))
      const before = files.openReadSession.mock.calls.length
      const task = await service.createTask(input, `permanent-${code}`)
      expect(await waitStatus(service, task.id, 'failed')).toMatchObject({ retryCount: 0, error: { code } })
      expect(files.openReadSession).toHaveBeenCalledTimes(before + 1)
    }
  })

  it('默认全局最多运行两个任务，取消后释放执行名额', async () => {
    const { service, files } = await start()
    files.stall()
    const first = await service.createTask(input, 'limit-first')
    await service.createTask(input, 'limit-second')
    const third = await service.createTask(input, 'limit-third')
    await vi.waitFor(() => expect(files.streams).toHaveLength(2))
    expect(service.getTask(third.id).status).toBe('queued')
    await service.cancelTask(first.id)
    await vi.waitFor(() => expect(files.streams).toHaveLength(3))
  })

  it('读取完成但块缓存不完整时不允许成功', async () => {
    const { service, files } = await start(fakeFiles(), { retryDelaysMs: [] })
    files.reportCache(false)
    const task = await service.createTask(input, 'missing-cache')
    expect(await waitStatus(service, task.id, 'failed')).toMatchObject({ processedFiles: 0, error: { code: 'cache-incomplete' } })
  })

  it('重试等待释放调度槽，同时仍阻止 Drive 卸载', async () => {
    const { service, files } = await start(fakeFiles(), { concurrency: 1, retryDelaysMs: [500] })
    files.fail(new DownloadTaskError(503, 'network-error', '网络失败。'))
    const first = await service.createTask(input, 'first')
    await vi.waitFor(() => expect(service.getTask(first.id).nextRetryAt).not.toBeNull())
    files.fail()
    const second = await service.createTask(input, 'second')
    await waitStatus(service, second.id, 'completed')
    expect(service.getTask(first.id).status).toBe('queued')
    await expect(activity.withExclusive(driveKey, async () => undefined)).rejects.toMatchObject({ status: 409 })
    await service.cancelTask(first.id)
  })

  it('正常退出持久化 queued 并自动恢复，暂停任务保持暂停', async () => {
    const files = fakeFiles()
    files.stall()
    const { service } = await start(files)
    const active = await service.createTask(input, 'active')
    const paused = await service.createTask(input, 'paused')
    await service.pauseTask(paused.id)
    await vi.waitFor(() => expect(service.getTask(active.id).driveVersion).toBe(7))
    await service.onModuleDestroy()
    services = []
    expect((await new DownloadTaskStore(storagePath).read()).map((task) => task.status)).toEqual(['queued', 'paused'])
    files.stall(false)
    const recovered = await start(files)
    await waitStatus(recovered.service, active.id, 'completed')
    expect(recovered.service.getTask(paused.id).status).toBe('paused')
    expect(files.openReadSession.mock.calls.at(-1)?.[1]).toMatchObject({ driveVersion: 7, driveFork: 0, contentFork: 0 })
  })

  it('重启保留已经消耗的自动重试预算', async () => {
    const files = fakeFiles()
    files.fail(new DownloadTaskError(503, 'network-error', '网络中断。'))
    const options = { retryDelaysMs: [1, 1, 60_000] }
    const { service } = await start(files, options)
    const task = await service.createTask(input, 'retry-budget')
    await vi.waitFor(() => expect(service.getTask(task.id)).toMatchObject({ status: 'queued', retryCount: 3 }))
    await service.onModuleDestroy()
    services = []
    const store = new DownloadTaskStore(storagePath)
    const saved = await store.read()
    saved[0]!.nextRetryAt = new Date(0).toISOString()
    await store.write(saved)
    const recovered = await start(files, options)
    expect(await waitStatus(recovered.service, task.id, 'failed')).toMatchObject({ retryCount: 3 })
    expect(files.openReadSession).toHaveBeenCalledTimes(4)
  })

  it('恢复时检查完整文件 checkpoint，缺失缓存会重新处理', async () => {
    const files = fakeFiles()
    const { service } = await start(files)
    const task = await service.createTask(input, 'checkpoint')
    await waitStatus(service, task.id, 'completed')
    await service.onModuleDestroy()
    services = []
    const store = new DownloadTaskStore(storagePath)
    const saved = await store.read()
    saved[0]!.status = 'running'
    await store.write(saved)
    files.cached.delete('/a.txt')
    files.createReadStream.mockClear()
    const recovered = await start(files)
    expect(await waitStatus(recovered.service, task.id, 'completed')).toMatchObject({ processedFiles: 2, processedBytes: 9 })
    expect(files.createReadStream).toHaveBeenCalledTimes(2)
  })

  it('任务列表使用稳定游标分页并拒绝无效游标', async () => {
    const { service } = await start()
    const first = await service.createTask(input, 'page-1')
    const second = await service.createTask(input, 'page-2')
    const third = await service.createTask(input, 'page-3')
    expect(service.listTasks(undefined, 2)).toMatchObject({ tasks: [{ id: first.id }, { id: second.id }], nextCursor: second.id })
    expect(service.listTasks(second.id, 2)).toMatchObject({ tasks: [{ id: third.id }], nextCursor: null })
    expect(() => service.listTasks('missing')).toThrow(DownloadTaskError)
  })

  it('损坏 JSON 或未知 schema 不被覆盖，并阻止启动', async () => {
    for (const content of ['{broken', '{"schemaVersion":2,"tasks":[]}']) {
      await writeFile(storagePath, content)
      const service = new DownloadTaskService(fakeFiles().service, activity, { storagePath })
      await expect(service.onModuleInit()).rejects.toThrow('离线任务存储无效')
      expect(await readFile(storagePath, 'utf8')).toBe(content)
    }
  })

  it('拒绝语法合法但完成统计损坏的存储记录', async () => {
    const { service } = await start()
    const task = await service.createTask(input, 'invalid-checkpoint')
    await waitStatus(service, task.id, 'completed')
    await service.onModuleDestroy()
    services = []
    const saved = await new DownloadTaskStore(storagePath).read()
    saved[0]!.completedBytes += 1
    const content = JSON.stringify({ schemaVersion: 1, tasks: saved })
    await writeFile(storagePath, content)
    await expect(new DownloadTaskStore(storagePath).read()).rejects.toThrow('离线任务存储无效')
    expect(await readFile(storagePath, 'utf8')).toBe(content)
  })

  it('持久化失败时创建不返回成功并释放 reservation', async () => {
    const store = new DownloadTaskStore(storagePath)
    const { service } = await start(fakeFiles(), { store })
    vi.spyOn(store, 'write').mockRejectedValue(new Error('磁盘写入失败。'))
    await expect(service.createTask(input, 'disk-failure')).rejects.toThrow('磁盘写入失败')
    expect(service.listTasks().tasks).toEqual([])
    await expect(activity.withExclusive(driveKey, async () => undefined)).resolves.toBeUndefined()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(service.onModuleDestroy()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
    services = []
  })

  it('关闭会等待创建中的持久化完成，随后释放晚到的 reservation', async () => {
    const store = new DownloadTaskStore(storagePath)
    const { service } = await start(fakeFiles(), { store })
    const originalWrite = store.write.bind(store)
    let unblock!: () => void
    const blocked = new Promise<void>((resolve) => { unblock = resolve })
    const write = vi.spyOn(store, 'write').mockImplementationOnce(async (tasks) => {
      await blocked
      await originalWrite(tasks)
    })
    const creating = service.createTask(input, 'shutdown-create')
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const closing = service.onModuleDestroy()
    unblock()
    const created = await creating
    await closing
    services = []
    expect((await new DownloadTaskStore(storagePath).read())[0]?.id).toBe(created.id)
    await expect(activity.withExclusive(driveKey, async () => undefined)).resolves.toBeUndefined()
  })
})
