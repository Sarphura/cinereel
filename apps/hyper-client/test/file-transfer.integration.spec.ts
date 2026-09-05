import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { create, type SDK } from 'hyper-sdk'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable, type Duplex } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { FileService } from '../src/hyper.implementation/file.service.js'
import { DriveActivity } from '../src/hyper.infrastructure/sdk/drive-activity.js'

async function digest(stream: Readable): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(stream, new Writable({
    write(chunk, _encoding, callback) {
      hash.update(chunk)
      callback()
    },
  }))
  return hash.digest('hex')
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

describe('真实 Hyperdrive 文件传输', () => {
  let storage: string
  let writer: SDK
  let reader: SDK
  let connections: Duplex[]

  beforeEach(async () => {
    storage = await mkdtemp(join(tmpdir(), 'cinereel-transfer-'))
    writer = await create({ storage: join(storage, 'writer'), autoJoin: false, swarmOpts: { bootstrap: [] } })
    reader = await create({ storage: join(storage, 'reader'), autoJoin: false, swarmOpts: { bootstrap: [] } })
    connections = []
  })

  afterEach(async () => {
    for (const connection of connections) connection.destroy()
    await Promise.all([writer?.close(), reader?.close()])
    await rm(storage, { recursive: true, force: true })
  })

  function connect(): void {
    const outgoing = writer.corestore.replicate(true) as Duplex
    const incoming = reader.corestore.replicate(false) as Duplex
    outgoing.on('error', () => undefined)
    incoming.on('error', () => undefined)
    outgoing.pipe(incoming).pipe(outgoing)
    connections.push(outgoing, incoming)
  }

  it('双节点分段字节正确，完整缓存重启后可断网读取', async () => {
    const drive = await writer.getDrive('range-fixture')
    const key = Buffer.from(drive.key).toString('hex')
    const chunks = Array.from({ length: 4 }, (_, i) => Buffer.alloc(1024 * 1024, i + 1))
    const content = Buffer.concat(chunks)
    await pipeline(Readable.from(chunks), drive.createWriteStream('/movie.mp4'))
    connect()

    const files = new FileService(reader)
    const session = await files.openReadSession(key, { timeoutMs: 3000 })
    const file = await session.getFile('/movie.mp4')
    expect(file.size).toBe(content.length)
    expect(await session.hasFile(file)).toBe(false)
    const range = { start: 1024 * 1024 - 7, end: 1024 * 1024 + 8 }
    expect(await collect(session.createReadStream(file, range))).toEqual(content.subarray(range.start, range.end + 1))
    expect(await session.hasFile(file)).toBe(false)
    const expectedHash = createHash('sha256').update(content).digest('hex')
    expect(await digest(session.createReadStream(file))).toBe(expectedHash)
    expect(await session.hasFile(file)).toBe(true)
    const driveVersion = session.driveVersion
    await session.close()

    for (const connection of connections) connection.destroy()
    connections = []
    await reader.close()
    reader = await create({ storage: join(storage, 'reader'), autoJoin: false, swarmOpts: { bootstrap: [] } })
    const offline = await new FileService(reader).openReadSession(key, { driveVersion, timeoutMs: 300 })
    try {
      const cached = await offline.getFile('/movie.mp4')
      expect(await offline.hasFile(cached)).toBe(true)
      expect(await digest(offline.createReadStream(cached))).toBe(expectedHash)
    } finally {
      await offline.close()
    }
  }, 15000)

  it('已打开的版本不受同路径后续覆盖或删除影响', async () => {
    const drive = await writer.getDrive('snapshot-fixture')
    const key = Buffer.from(drive.key).toString('hex')
    await drive.put('/file.txt', Buffer.from('original'))
    const files = new FileService(writer)
    const oldSession = await files.openReadSession(key)
    const oldFile = await oldSession.getFile('/file.txt')
    await drive.put('/file.txt', Buffer.from('replacement-longer'))
    const newSession = await files.openReadSession(key)
    const newFile = await newSession.getFile('/file.txt')
    try {
      expect(oldFile.etag).not.toBe(newFile.etag)
      await drive.del('/file.txt')
      expect((await collect(oldSession.createReadStream(oldFile))).toString()).toBe('original')
      expect((await collect(newSession.createReadStream(newFile))).toString()).toBe('replacement-longer')
    } finally {
      await oldSession.close()
      await newSession.close()
    }
  })

  it('未知远端有界超时，不能把未知元数据当作空盘', async () => {
    const activity = new DriveActivity()
    const files = new FileService(reader, activity)
    const key = '1'.repeat(64)
    await expect(files.openReadSession(key, { timeoutMs: 80 })).rejects.toMatchObject({ status: 504 })
    await activity.withExclusive(key, async () => undefined)
  })

  it('取消一个读取不会关闭同 Drive 的其他读取', async () => {
    const drive = await writer.getDrive('cancel-fixture')
    const key = Buffer.from(drive.key).toString('hex')
    await drive.put('/file.txt', Buffer.from('survives'))
    const files = new FileService(writer)
    const abort = new AbortController()
    const first = await files.openReadSession(key, { signal: abort.signal })
    const second = await files.openReadSession(key)
    abort.abort()
    await first.close()
    try {
      const file = await second.getFile('/file.txt')
      expect((await collect(second.createReadStream(file))).toString()).toBe('survives')
      expect(drive.readable).toBe(true)
    } finally {
      await second.close()
    }
  })
})
