import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { create, type SDK } from 'hyper-sdk'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable, type Duplex } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { FileService } from '../src/hyper.implementation/file.service.js'
import { DownloadTaskService } from '../src/hyper.implementation/download-task.service.js'
import { DriveActivity } from '../src/hyper.infrastructure/sdk/drive-activity.js'

async function digest(stream: Readable): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(stream, new Writable({
    write(chunk, _encoding, callback) { hash.update(chunk); callback() },
  }))
  return hash.digest('hex')
}

async function until(check: () => boolean, timeoutMs = 6000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('任务未在期限内到达预期状态。')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('真实双节点离线任务恢复', () => {
  let storage: string
  let writer: SDK
  let reader: SDK
  let downloads: DownloadTaskService | undefined
  let links: Duplex[]
  let activity: DriveActivity
  let files: FileService

  async function openReader(): Promise<void> {
    reader = await create({ storage: join(storage, 'reader'), autoJoin: false, swarmOpts: { bootstrap: [] } })
    activity = new DriveActivity()
    files = new FileService(reader, activity)
    downloads = new DownloadTaskService(files, activity, {
      storagePath: join(storage, 'download-tasks.json'), timeoutMs: 3000,
    })
    await downloads.onModuleInit()
  }

  function disconnect(): void {
    for (const link of links) link.destroy()
    links = []
  }

  function connect(): void {
    const outgoing = writer.corestore.replicate(true) as Duplex
    const incoming = reader.corestore.replicate(false) as Duplex
    outgoing.on('error', () => undefined)
    incoming.on('error', () => undefined)
    outgoing.pipe(incoming).pipe(outgoing)
    links.push(outgoing, incoming)
  }

  beforeEach(async () => {
    storage = await mkdtemp(join(tmpdir(), 'cinereel-offline-'))
    links = []
    writer = await create({ storage: join(storage, 'writer'), autoJoin: false, swarmOpts: { bootstrap: [] } })
    await openReader()
  })

  afterEach(async () => {
    await downloads?.onModuleDestroy()
    disconnect()
    await Promise.all([writer?.close(), reader?.close()])
    await rm(storage, { recursive: true, force: true })
  })

  it('目录任务固定旧版本，完成后重启并断网仍可读取旧文件', async () => {
    const drive = await writer.getDrive('offline-version')
    const key = Buffer.from(drive.key).toString('hex')
    await drive.put('/collection/a.txt', Buffer.from('original'))
    await drive.put('/collection/sub/b.txt', Buffer.from('second'))
    const driveVersion = drive.version
    await drive.put('/collection/a.txt', Buffer.from('new-content'))
    await drive.put('/collection/new.txt', Buffer.from('new-file'))
    connect()
    const task = await downloads!.createTask({
      driveKey: key, path: '/collection', targetType: 'directory', driveVersion,
    }, 'offline-directory')
    await until(() => ['completed', 'failed'].includes(downloads!.getTask(task.id).status))
    expect(downloads!.getTask(task.id)).toMatchObject({
      status: 'completed', driveVersion, totalFiles: 2, processedFiles: 2,
      totalBytes: 14, processedBytes: 14,
    })
    await downloads!.onModuleDestroy()
    downloads = undefined
    disconnect()
    await reader.close()
    await openReader()
    expect(downloads!.getTask(task.id).status).toBe('completed')
    const session = await files.openReadSession(key, { driveVersion, timeoutMs: 300 })
    try {
      const original = await session.getFile('/collection/a.txt')
      expect(await digest(session.createReadStream(original))).toBe(createHash('sha256').update('original').digest('hex'))
      await expect(session.getFile('/collection/new.txt')).rejects.toMatchObject({ status: 404 })
    } finally {
      await session.close()
    }
  }, 15000)

  it('部分缓存后暂停，重启保持暂停，恢复网络继续原任务', async () => {
    const drive = await writer.getDrive('offline-resume')
    const key = Buffer.from(drive.key).toString('hex')
    await drive.put('/a.txt', Buffer.from('cached-first'))
    const chunks = [Buffer.alloc(1024 * 1024, 3), Buffer.alloc(1024 * 1024, 4)]
    await pipeline(Readable.from(chunks), drive.createWriteStream('/b.bin'))
    connect()
    const prepared = await files.openReadSession(key, { timeoutMs: 3000 })
    await digest(prepared.createReadStream(await prepared.getFile('/a.txt')))
    const missing = await prepared.getFile('/b.bin')
    expect(await prepared.hasFile(missing)).toBe(false)
    const driveVersion = prepared.driveVersion
    await prepared.close()
    disconnect()
    const task = await downloads!.createTask({ driveKey: key, path: '/', targetType: 'directory' }, 'resume-root')
    await until(() => downloads!.getTask(task.id).currentPath === '/b.bin')
    const paused = await downloads!.pauseTask(task.id)
    expect(paused).toMatchObject({ status: 'paused', processedFiles: 1, processedBytes: 12, driveVersion })
    await expect(activity.withExclusive(key, async () => undefined)).rejects.toMatchObject({ status: 409 })

    await downloads!.onModuleDestroy()
    downloads = undefined
    await reader.close()
    await openReader()
    expect(downloads!.getTask(task.id)).toMatchObject({ status: 'paused', processedFiles: 1, driveVersion })
    connect()
    await downloads!.resumeTask(task.id)
    await until(() => ['completed', 'failed'].includes(downloads!.getTask(task.id).status))
    expect(downloads!.getTask(task.id)).toMatchObject({
      status: 'completed', processedFiles: 2, processedBytes: 12 + 2 * 1024 * 1024, driveVersion,
    })
    await downloads!.onModuleDestroy()
    downloads = undefined
    await activity.withExclusive(key, async () => undefined)
    disconnect()
    const cached = await files.openReadSession(key, { driveVersion, timeoutMs: 300 })
    try {
      expect(await digest(cached.createReadStream(await cached.getFile('/b.bin'))))
        .toBe(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'))
    } finally {
      await cached.close()
    }
  }, 15000)
})
