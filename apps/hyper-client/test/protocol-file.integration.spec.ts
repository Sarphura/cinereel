import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import { create, type SDK } from 'hyper-sdk'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Readable, type Duplex } from 'node:stream'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { FileService } from '../src/hyper.implementation/file.service.js'
import { FileController } from '../src/hyper.api/controller/files/file.controller.js'
import { ProtocolFileController } from '../src/hyper.api/controller/files/protocol-file.controller.js'
import { MAX_PROTOCOL_FILE_SIZE } from '../src/hyper.implementation/protocol-file.js'

const path = '/.cinereel/drive.json'

describe('真实 Hyperdrive 协议文件 HTTP 接口', () => {
  let storage: string
  let sdk: SDK
  let drive: Awaited<ReturnType<SDK['getDrive']>>
  let key: string
  let service: FileService
  let app: INestApplication
  const otherSdks: SDK[] = []
  const connections: Duplex[] = []
  const url = () => `/v1/protocol-files/${key}`
  const put = (content: Buffer | string, etag?: string) => request(app.getHttpServer()).put(url()).query({ path })
    .set('Content-Type', 'application/octet-stream').set(etag ? 'If-Match' : 'If-None-Match', etag ?? '*').send(content)

  beforeEach(async () => {
    storage = await mkdtemp(join(tmpdir(), 'cinereel-protocol-'))
    sdk = await create({ storage, autoJoin: false, swarmOpts: { bootstrap: [] } })
    vi.spyOn(sdk, 'join').mockReturnValue({ destroy: async () => {}, flushed: async () => {}, refresh: async () => {} })
    drive = await sdk.getDrive('protocol')
    key = drive.key.toString('hex')
    service = new FileService(sdk)
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController, ProtocolFileController],
      providers: [{ provide: FileService, useValue: service }, { provide: APP_PIPE, useClass: ZodValidationPipe }],
    }).compile()
    app = moduleRef.createNestApplication()
    app.useLogger(false)
    await app.init()
  })

  afterEach(async () => {
    app?.getHttpServer().closeAllConnections?.()
    await app?.close()
    for (const connection of connections.splice(0)) connection.destroy()
    await Promise.all([sdk?.close(), ...otherSdks.splice(0).map((other) => other.close())])
    await rm(storage, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('创建、读取、条件替换透传字节，ETag 不受普通文件变更影响且拒绝旧版本', async () => {
    await request(app.getHttpServer()).get(url()).query({ path }).expect(404)
    const bytes = Buffer.from([0, 255, 1, 2])
    const created = await put(bytes).expect(201)
    expect(created.headers.etag).toMatch(/^"[a-f0-9]{64}"$/u)
    await service.addFile(key, '/movie', Readable.from('movie'))
    const read = await request(app.getHttpServer()).get(url()).query({ path }).expect(200)
    expect(read.body).toEqual(bytes)
    expect(read.headers.etag).toBe(created.headers.etag)
    expect(Number(read.headers['x-drive-version'])).toBeGreaterThan(Number(created.headers['x-drive-version']))
    expect(read.headers['content-type']).toBe('application/octet-stream')
    const replaced = await put('next', created.headers.etag).expect(200)
    expect(replaced.headers.etag).not.toBe(created.headers.etag)
    await put('stale', created.headers.etag).expect(412)
    await put('duplicate').expect(412)
    expect((await drive.get(path))?.toString()).toBe('next')
  })

  it('同内容 ABA 和元数据截断均不能恢复旧 ETag', async () => {
    const first = await put('A').expect(201)
    const second = await put('B', first.headers.etag).expect(200)
    const third = await put('A', second.headers.etag).expect(200)
    expect(third.headers.etag).not.toBe(first.headers.etag)
    await drive.truncate(1)
    const recreated = await put('A').expect(201)
    expect(recreated.headers.etag).not.toBe(first.headers.etag)
    await put('stale', first.headers.etag).expect(412)
  })

  it('并发创建和替换只允许一个请求满足预条件', async () => {
    const creates = await Promise.all([put('first'), put('second')])
    expect(creates.map((response) => response.status).sort()).toEqual([201, 412])
    const etag = creates.find((response) => response.status === 201)!.headers.etag as string
    const replaces = await Promise.all([put('third', etag), put('fourth', etag)])
    expect(replaces.map((response) => response.status).sort()).toEqual([200, 412])
  })

  it('普通文件上传和协议替换共用 Drive 写锁，根目录删除保留协议文件', async () => {
    const created = await put('before').expect(201)
    const upload = new PassThrough()
    const writing = service.addFile(key, '/movie', upload)
    let replaced = false
    const replacing = service.writeProtocolFile(key, path, Buffer.from('after'), { ifMatch: created.headers.etag as string })
      .then(() => { replaced = true })
    const deleting = service.deleteDirectory(key, '/')
    await new Promise((resolve) => setImmediate(resolve))
    expect(replaced).toBe(false)
    expect((await drive.get(path))?.toString()).toBe('before')
    upload.end('movie')
    await Promise.all([writing, replacing, deleting])
    expect((await drive.get(path))?.toString()).toBe('after')
    expect(await drive.entry('/movie')).toBeNull()
  })

  it('正文写入后元数据提交失败仍保留原协议文件及其 ETag', async () => {
    const created = await put('before').expect(201)
    const putEntry = vi.spyOn(drive.db, 'put').mockRejectedValueOnce(Object.assign(new Error('存储失败'), { code: 'EIO' }))
    await put('incomplete replacement', created.headers.etag).expect(500)
    putEntry.mockRestore()
    const read = await request(app.getHttpServer()).get(url()).query({ path }).expect(200)
    expect(read.body.toString()).toBe('before')
    expect(read.headers.etag).toBe(created.headers.etag)
  })

  it('完整验证正文上限和请求条件后才改变文件', async () => {
    const created = await put(Buffer.alloc(MAX_PROTOCOL_FILE_SIZE, 1)).expect(201)
    await put(Buffer.alloc(MAX_PROTOCOL_FILE_SIZE + 1), created.headers.etag).expect(413)
    await request(app.getHttpServer()).put(url()).query({ path }).set('Content-Type', 'application/octet-stream').send('missing').expect(428)
    for (const condition of ['*', 'W/"weak"', '"a", "b"']) {
      await put('invalid', condition).expect(400)
    }
    await request(app.getHttpServer()).put(url()).query({ path }).set('If-None-Match', '*').set('If-Match', '"a"').set('Content-Type', 'application/octet-stream').send('invalid').expect(400)
    await request(app.getHttpServer()).put(url()).query({ path }).set('If-Match', created.headers.etag).send({ json: true }).expect(415)
    expect(await drive.get(path)).toEqual(Buffer.alloc(MAX_PROTOCOL_FILE_SIZE, 1))
    await put(Buffer.alloc(0), created.headers.etag).expect(200)
    const empty = await request(app.getHttpServer()).get(url()).query({ path }).expect(200)
    expect(empty.headers['content-length']).toBe('0')
  })

  it('拒绝过大远端文件、目录及符号链接，并检查保留目录根节点冲突', async () => {
    await drive.put(path, Buffer.alloc(MAX_PROTOCOL_FILE_SIZE + 1))
    await request(app.getHttpServer()).get(url()).query({ path }).expect(413)
    await drive.del(path)
    await drive.put(`${path}/child`, Buffer.from('child'))
    await request(app.getHttpServer()).get(url()).query({ path }).expect(409)
    await put('directory').expect(409)
    await drive.del(`${path}/child`)
    await drive.symlink(path, '/outside')
    await request(app.getHttpServer()).get(url()).query({ path }).expect(409)
    await put('symlink').expect(409)
    await drive.del(path)
    await drive.symlink('/.cinereel', '/outside')
    await request(app.getHttpServer()).get(url()).query({ path }).expect(409)
    await put('parent symlink').expect(409)
    await drive.put('/.cinereel', Buffer.from('file'))
    await put('parent file').expect(409)
    for (const invalidPath of ['/.cinereel', '/ordinary', '/.cinereel/../file', '/.cinereel//file']) {
      await request(app.getHttpServer()).get(url()).query({ path: invalidPath }).expect(400)
    }
  })

  it('普通文件接口隔离整个保留前缀，分页和离线枚举过滤后仍保留相似名称', async () => {
    await put('manifest').expect(201)
    await drive.put('/.cinereel/future/config', Buffer.from('future'))
    await drive.put('/.cinereel-other', Buffer.from('ordinary'))
    await drive.put('/a', Buffer.from('a'))
    for (const protectedPath of ['/.cinereel', path, '/.cinereel/future']) {
      const fileUrl = `/v1/files/${key}`
      await request(app.getHttpServer()).get(fileUrl).query({ path: protectedPath }).expect(403)
      await request(app.getHttpServer()).get(`${fileUrl}/entries`).query({ path: protectedPath }).expect(403)
      await request(app.getHttpServer()).put(fileUrl).query({ path: protectedPath }).set('Content-Type', 'application/octet-stream').send('override').expect(403)
      await request(app.getHttpServer()).delete(fileUrl).query({ path: protectedPath }).expect(403)
      await request(app.getHttpServer()).delete(`${fileUrl}/entries`).query({ path: protectedPath }).expect(403)
    }
    const page = await service.listDirectory(key, '/', undefined, 1)
    expect(page.entries.map((entry) => entry.path)).toEqual(['/.cinereel-other'])
    const lastPage = await service.listDirectory(key, '/', page.nextCursor ?? undefined, 1)
    expect(lastPage.entries.map((entry) => entry.path)).toEqual(['/a'])
    expect(lastPage.nextCursor).toBeNull()
    const session = await service.openReadSession(key)
    try {
      const entries = []
      for await (const entry of session.entries('/')) entries.push(entry.path)
      expect(entries).toEqual(['/.cinereel-other', '/a'])
      await expect(session.getFile(path)).rejects.toMatchObject({ status: 403 })
      expect(() => session.entries('/.cinereel')).toThrow()
    } finally { await session.close() }
    await service.deleteDirectory(key, '/')
    expect((await drive.get(path))?.toString()).toBe('manifest')
    expect((await drive.get('/.cinereel/future/config'))?.toString()).toBe('future')
    expect(await drive.entry('/a')).toBeNull()
    expect(await drive.entry('/.cinereel-other')).toBeNull()
  })

  it('普通路径符号链接不能绕过协议目录隔离', async () => {
    await put('manifest').expect(201)
    await drive.symlink('/alias', '/.cinereel')
    const fileUrl = `/v1/files/${key}`
    await request(app.getHttpServer()).get(fileUrl).query({ path: '/alias/drive.json' }).expect(409)
    await request(app.getHttpServer()).put(fileUrl).query({ path: '/alias/drive.json' }).set('Content-Type', 'application/octet-stream').send('override').expect(409)
    await request(app.getHttpServer()).delete(`${fileUrl}/entries`).query({ path: '/alias' }).expect(200)
    expect((await drive.get(path))?.toString()).toBe('manifest')
  })

  it('分块正文超限返回 413，中断上传不覆盖旧内容', async () => {
    const created = await put('before').expect(201)
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    const options = {
      host: '127.0.0.1', port: address.port, method: 'PUT', path: `${url()}?path=${encodeURIComponent(path)}`,
      headers: { 'Content-Type': 'application/octet-stream', 'If-Match': created.headers.etag as string },
    }
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = httpRequest(options, (response) => { response.resume(); response.on('end', () => resolve(response.statusCode)) })
      outgoing.on('error', reject)
      outgoing.write(Buffer.alloc(MAX_PROTOCOL_FILE_SIZE))
      outgoing.end(Buffer.alloc(1))
    })
    expect(status).toBe(413)
    await new Promise<void>((resolve) => {
      const outgoing = httpRequest(options)
      outgoing.on('error', () => {})
      outgoing.on('close', resolve)
      outgoing.write('unfinished')
      outgoing.flushHeaders()
      setTimeout(() => outgoing.destroy(), 25)
    })
    expect((await drive.get(path))?.toString()).toBe('before')
  })

  it('远端复制可读、不可写，未知元数据超时不能返回不存在', async () => {
    await put('replicated').expect(201)
    const reader = await create({ storage: join(storage, 'reader'), autoJoin: false, swarmOpts: { bootstrap: [] } })
    otherSdks.push(reader)
    const outgoing = sdk.corestore.replicate(true) as Duplex
    const incoming = reader.corestore.replicate(false) as Duplex
    outgoing.on('error', () => {})
    incoming.on('error', () => {})
    outgoing.pipe(incoming).pipe(outgoing)
    connections.push(outgoing, incoming)
    const remote = new FileService(reader)
    const file = await remote.readProtocolFile(key, path, { timeoutMs: 1500 })
    expect(file.content.toString()).toBe('replicated')
    await expect(remote.writeProtocolFile(key, path, Buffer.from('forbidden'), { ifMatch: file.etag })).rejects.toMatchObject({ status: 403 })
    await expect(remote.readProtocolFile('ab'.repeat(32), path, { timeoutMs: 80 })).rejects.toMatchObject({ status: 504 })
  })
})
