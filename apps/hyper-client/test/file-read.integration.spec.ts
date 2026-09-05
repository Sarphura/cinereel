import { afterEach, describe, expect, it, vi } from 'vitest'
import { create, type SDK } from 'hyper-sdk'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { Readable as NodeReadable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Duplex, Readable } from 'node:stream'
import { FileService, normalizeFileReadError, type FileReadSession } from '../src/hyper.implementation/file.service.js'
import { DriveActivity } from '../src/hyper.infrastructure/sdk/drive-activity.js'

const sdks: SDK[] = []
const paths: string[] = []
const sessions: FileReadSession[] = []
const connections: Duplex[] = []

async function node(): Promise<SDK> {
  const storage = await mkdtemp(join(tmpdir(), 'cinereel-file-read-'))
  paths.push(storage)
  const sdk = await create({
    storage,
    autoJoin: false,
    swarmOpts: { bootstrap: [] } as NonNullable<Parameters<typeof create>[0]>['swarmOpts'],
  })
  sdks.push(sdk)
  vi.spyOn(sdk, 'join').mockReturnValue({
    destroy: async () => {},
    flushed: async () => {},
    refresh: async () => {},
  })
  return sdk
}

function connect(left: SDK, right: SDK): () => void {
  const a = (left.corestore as unknown as { replicate(initiator: boolean): Duplex }).replicate(true)
  const b = (right.corestore as unknown as { replicate(initiator: boolean): Duplex }).replicate(false)
  a.on('error', () => {})
  b.on('error', () => {})
  a.pipe(b).pipe(a)
  connections.push(a, b)
  return () => { a.destroy(); b.destroy() }
}

async function open(service: FileService, key: string, options: Parameters<FileService['openReadSession']>[1] = {}) {
  const session = await service.openReadSession(key, { timeoutMs: 1500, ...options })
  sessions.push(session)
  return session
}

async function bytes(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.destroy()
  await Promise.all(sessions.splice(0).map((session) => session.close()))
  await Promise.all(sdks.splice(0).map((sdk) => sdk.close()))
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

describe('真实 Hyperdrive 读取会话', () => {
  it('固定版本读取范围、空文件和中文路径，关闭不影响其他会话或共享 Drive', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('source')
    const key = drive.key.toString('hex')
    await drive.put('/电影.txt', Buffer.from('0123456789'))
    await drive.put('/empty', Buffer.alloc(0))
    await drive.put('/dir/nested', Buffer.from('nested'))
    await drive.symlink('/link', '/电影.txt')
    const activity = new DriveActivity()
    const service = new FileService(sdk, activity)
    const first = await open(service, key)
    const file = await first.getFile('/电影.txt')
    await drive.put('/电影.txt', Buffer.from('changed'))
    const second = await open(service, key)

    expect(first.driveVersion).toBeLessThan(second.driveVersion)
    expect(await bytes(first.createReadStream(file, { start: 2, end: 5 }))).toEqual(Buffer.from('2345'))
    expect(await first.hasFile(file)).toBe(true)
    expect(await bytes(first.createReadStream(await first.getFile('/empty')))).toEqual(Buffer.alloc(0))
    await expect(first.getFile('/dir')).rejects.toMatchObject({ status: 409 })
    await expect(first.getFile('/link')).rejects.toMatchObject({ status: 409 })
    await expect(first.getFile('/missing')).rejects.toMatchObject({ status: 404 })
    const entries = []
    for await (const entry of first.entries('/')) entries.push(entry)
    expect(entries.find((entry) => entry.path === '/link')?.type).toBe('symlink')
    await expect(activity.withExclusive(key, async () => {})).rejects.toMatchObject({ status: 409 })
    await first.close()
    expect(await bytes(second.createReadStream(await second.getFile('/电影.txt')))).toEqual(Buffer.from('changed'))
    await second.close()
    await expect(activity.withExclusive(key, async () => {})).resolves.toBeUndefined()
    expect(await drive.get('/电影.txt')).toEqual(Buffer.from('changed'))
  })

  it('允许可写空根目录，拒绝不存在的非根目录', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('empty')
    const session = await open(new FileService(sdk), drive.key.toString('hex'))
    const entries = []
    for await (const entry of session.entries('/')) entries.push(entry)
    expect(entries).toEqual([])
    await expect(session.entries('/missing')[Symbol.asyncIterator]().next()).rejects.toMatchObject({ status: 404 })
  })

  it('首次远端未知 key 的等待有界，不能将缺少元数据判为不存在', async () => {
    const sdk = await node()
    const activity = new DriveActivity()
    const service = new FileService(sdk, activity)
    const started = Date.now()
    await expect(service.openReadSession('ab'.repeat(32), { timeoutMs: 80 })).rejects.toMatchObject({ status: 504 })
    expect(Date.now() - started).toBeLessThan(1000)
    await expect(activity.withExclusive('ab'.repeat(32), async () => {})).resolves.toBeUndefined()
  })

  it('首块等待时销毁流可立即解除等待，暂停会话不会关闭共享 Drive', async () => {
    const source = await node()
    const target = await node()
    const drive = await source.getDrive('source')
    await drive.put('/movie.mp4', Buffer.alloc(1024 * 1024, 0x42))
    const disconnect = connect(source, target)
    const key = drive.key.toString('hex')
    const session = await open(new FileService(target), key)
    const file = await session.getFile('/movie.mp4')
    disconnect()
    const stream = session.createReadStream(file)
    stream.resume()
    await delay(25)
    const closed = once(stream, 'close')
    stream.destroy()
    await closed
    expect(stream.destroyed).toBe(true)
    await session.close()
    const shared = await target.getDrive(key)
    expect(shared.version).toBeGreaterThan(1)
  })

  it('会话关闭必须等候缺块中的正文流停止，不能留下后台读取', async () => {
    const source = await node()
    const target = await node()
    const drive = await source.getDrive('source')
    await drive.put('/movie.mp4', Buffer.alloc(1024, 0x42))
    const disconnect = connect(source, target)
    const session = await open(new FileService(target), drive.key.toString('hex'))
    const file = await session.getFile('/movie.mp4')
    disconnect()
    const stream = session.createReadStream(file)
    stream.resume()
    await delay(25)
    await session.close()
    expect(stream.closed).toBe(true)
  })

  it('元数据截断使活动会话与原 fork 的恢复失败', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('source')
    await drive.put('/a', Buffer.from('before'))
    const service = new FileService(sdk)
    const key = drive.key.toString('hex')
    const session = await open(service, key)
    const version = session.driveVersion
    const fork = session.driveFork
    await drive.truncate(1)
    await drive.put('/a', Buffer.from('after'))
    await expect(session.getFile('/a')).rejects.toMatchObject({ code: 'version-unavailable' })
    await expect(service.openReadSession(key, { driveVersion: version, driveFork: fork })).rejects.toMatchObject({ code: 'version-unavailable' })
  })

  it('blockMap 内容在本地完整校验后可读取且范围正确', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('mapped')
    const mappedDrive = drive as unknown as { createWriteStream(path: string, options: { dedup: boolean }): Writable }
    await pipeline(NodeReadable.from([Buffer.from('abcdef'), Buffer.from('abcdef')]), mappedDrive.createWriteStream('/mapped', { dedup: true }))
    const session = await open(new FileService(sdk), drive.key.toString('hex'))
    const file = await session.getFile('/mapped')
    expect(file.size).toBe(12)
    expect(await session.hasFile(file)).toBe(true)
    expect((await bytes(session.createReadStream(file))).toString()).toBe('abcdefabcdef')
    expect((await bytes(session.createReadStream(file, { start: 3, end: 8 }))).toString()).toBe('defabc')
  })

  it('本地磁盘错误不能伪装为可重试的网络错误', () => {
    for (const code of ['ENOSPC', 'EIO', 'EROFS', 'EACCES', 'EDQUOT']) {
      expect(normalizeFileReadError(Object.assign(new Error('磁盘失败'), { code }))).toMatchObject({ code: 'storage-error', status: 500 })
    }
  })

  it('合并首次打开，取消请求后仍登记迟到的 SDK 打开直到它完成', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('source')
    const key = drive.key.toString('hex')
    let resolveDrive!: (value: typeof drive) => void
    const pending = new Promise<typeof drive>((resolve) => { resolveDrive = resolve })
    const getDrive = vi.spyOn(sdk, 'getDrive').mockImplementationOnce(() => pending)
    const activity = new DriveActivity()
    const service = new FileService(sdk, activity)
    const abort = new AbortController()
    const first = service.openReadSession(key, { signal: abort.signal })
    const second = service.openReadSession(key, { signal: abort.signal })
    abort.abort()
    expect(await Promise.allSettled([first, second])).toEqual([
      expect.objectContaining({ status: 'rejected' }),
      expect.objectContaining({ status: 'rejected' }),
    ])
    expect(getDrive).toHaveBeenCalledTimes(1)
    expect(getDrive).toHaveBeenCalledWith(key, { autoJoin: false })
    await expect(activity.withExclusive(key, async () => {})).rejects.toMatchObject({ status: 409 })
    resolveDrive(drive)
    await pending
    await expect(activity.withExclusive(key, async () => {})).resolves.toBeUndefined()
  })

  it('无 blob 的普通 entry 不能按零字节文件成功返回', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('source')
    await (drive as unknown as { putEntry(path: string, value: { blob: null }): Promise<void> }).putEntry('/incomplete', { blob: null })
    const session = await open(new FileService(sdk), drive.key.toString('hex'))
    await expect(session.getFile('/incomplete')).rejects.toMatchObject({ status: 409 })
    await expect(session.getFile('/../incomplete')).rejects.toBeInstanceOf(TypeError)
    await expect(session.getFile('/')).rejects.toMatchObject({ status: 409 })
  })

  it('首次读取远端已有截断历史的当前版本仍可正常取得正文', async () => {
    const source = await node()
    const target = await node()
    const drive = await source.getDrive('source')
    await drive.put('/a', Buffer.from('before'))
    await drive.truncate(1)
    await drive.put('/a', Buffer.from('after'))
    connect(source, target)
    const session = await open(new FileService(target), drive.key.toString('hex'))
    expect(session.contentFork).toBeNull()
    expect(await session.prepareContent()).toBe(1)
    expect(session.contentFork).toBe(1)
    expect((await bytes(session.createReadStream(await session.getFile('/a')))).toString()).toBe('after')
  })

  it('正文独立截断后旧正文 fork 的恢复失败，新内容的 ETag 必须改变', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('source')
    await drive.put('/a', Buffer.from('before'))
    const service = new FileService(sdk)
    const key = drive.key.toString('hex')
    const before = await open(service, key)
    const beforeFile = await before.getFile('/a')
    const driveVersion = before.driveVersion
    const driveFork = before.driveFork
    const contentFork = await before.prepareContent()
    expect(contentFork).toBe(0)
    await before.close()
    const blobs = await drive.getBlobs()
    await blobs.core.truncate(0)
    await blobs.core.append(Buffer.from('after!'))
    expect(drive.version).toBe(driveVersion)
    expect(drive.core.fork).toBe(driveFork)
    const restored = await open(service, key, { driveVersion, driveFork, contentFork: contentFork! })
    await expect(restored.prepareContent()).rejects.toMatchObject({ code: 'version-unavailable', status: 503 })
    await expect(restored.getFile('/a')).rejects.toMatchObject({ code: 'version-unavailable' })
    const latest = await open(service, key, { driveVersion, driveFork })
    const latestFile = await latest.getFile('/a')
    expect(latest.contentFork).toBe(1)
    expect(latestFile.etag).not.toBe(beforeFile.etag)
    expect((await bytes(latest.createReadStream(latestFile))).toString()).toBe('after!')
  })

  it('空固定版本没有正文历史时 prepareContent 返回 null，不能猜测远端 fork', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('empty-content')
    await drive.put('/empty', Buffer.alloc(0))
    const session = await open(new FileService(sdk), drive.key.toString('hex'))
    expect(session.contentFork).toBeNull()
    expect(await session.prepareContent()).toBeNull()
    expect((await session.getFile('/empty')).size).toBe(0)
    expect(session.contentFork).toBeNull()
  })

  it('异步解析 blockMap 元数据的底层超时仍按 504 映射', async () => {
    const sdk = await node()
    const drive = await sdk.getDrive('mapped')
    const mappedDrive = drive as unknown as {
      createWriteStream(path: string, options: { dedup: boolean }): Writable
      getBlobs(): Promise<{ constructor: { prototype: { getByteLength(): Promise<number> } } }>
    }
    await pipeline(NodeReadable.from([Buffer.from('abcdef')]), mappedDrive.createWriteStream('/mapped', { dedup: true }))
    const session = await open(new FileService(sdk), drive.key.toString('hex'))
    const blobs = await mappedDrive.getBlobs()
    vi.spyOn(blobs.constructor.prototype, 'getByteLength').mockRejectedValueOnce(
      Object.assign(new Error('等待映射超时'), { code: 'REQUEST_TIMEOUT' }),
    )
    await expect(session.getFile('/mapped')).rejects.toMatchObject({ status: 504, code: 'read-timeout' })
  })
})
