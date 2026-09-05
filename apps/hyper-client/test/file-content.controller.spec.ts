import { afterEach, describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Readable } from 'node:stream'
import { get, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import request from 'supertest'
import { cleanupOpenApiDoc, ZodValidationPipe } from 'nestjs-zod'
import { FileController } from '../src/hyper.api/controller/files/file.controller.js'
import { FileReadError, FileService } from '../src/hyper.implementation/file.service.js'

const driveKey = 'a'.repeat(64)
const fileUrl = `/v1/files/${driveKey}`
const content = Buffer.from('0123456789')
const etag = '"fixed-file-etag"'

function readError(status: number, code: string): FileReadError {
  return new FileReadError(code, status, '读取失败。')
}

describe('文件内容 HTTP 接口', () => {
  let app: INestApplication | undefined

  afterEach(async () => {
    app?.getHttpServer().closeAllConnections?.()
    await app?.close()
  })

  async function setup(data = content) {
    const session = {
      driveVersion: 9,
      driveFork: 0,
      getFile: vi.fn(async (path: string) => ({ path, type: 'file' as const, size: data.length, etag })),
      createReadStream: vi.fn((_file: unknown, range?: { start: number; end: number }): Readable =>
        Readable.from([range ? data.subarray(range.start, range.end + 1) : data])),
      close: vi.fn(async () => {}),
    }
    const openReadSession = vi.fn(async (_key: string, _options: { driveVersion?: number; signal?: AbortSignal }) => session)
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: { openReadSession } },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    app.useLogger(false)
    await app.init()
    return { app, session, openReadSession }
  }

  it('完整读取固定版本，返回类型、长度和缓存标识', async () => {
    const { app, session, openReadSession } = await setup()
    const response = await request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.txt', driveVersion: 9 }).expect(200)
    expect(response.text).toBe(content.toString())
    expect(response.headers).toMatchObject({
      'content-type': 'text/plain; charset=utf-8',
      'content-length': '10',
      'content-disposition': 'inline; filename="movie.txt"',
      'accept-ranges': 'bytes',
      etag,
      'x-drive-version': '9',
    })
    expect(openReadSession).toHaveBeenCalledWith(driveKey, { driveVersion: 9, signal: expect.any(AbortSignal) })
    expect(session.close).toHaveBeenCalledOnce()
  })

  it('使用编码后的中文附件名，未知扩展名返回二进制类型', async () => {
    const { app } = await setup()
    const response = await request(app.getHttpServer()).get(fileUrl).query({ path: '/目录/影片.unknown', disposition: 'attachment' }).expect(200)
    expect(response.headers['content-type']).toBe('application/octet-stream')
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''%E5%BD%B1%E7%89%87.unknown")
    expect(response.headers['content-disposition']).toMatch(/^attachment;/u)
  })

  it('HEAD 在 GET 之前匹配，忽略 Range 且不创建正文流', async () => {
    const { app, session } = await setup()
    const response = await request(app.getHttpServer()).head(fileUrl).query({ path: '/movie.mp4' }).set('Range', 'bytes=2-3').expect(200)
    expect(response.text).toBeUndefined()
    expect(response.headers['content-length']).toBe('10')
    expect(response.headers['content-type']).toBe('video/mp4')
    expect(response.headers['content-range']).toBeUndefined()
    expect(session.createReadStream).not.toHaveBeenCalled()
    expect(session.close).toHaveBeenCalledOnce()
  })

  it.each([
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=-100', '0123456789', 'bytes 0-9/10'],
    ['bytes=8-100', '89', 'bytes 8-9/10'],
    ['bytes=0-0', '0', 'bytes 0-0/10'],
  ])('处理单段 Range %s', async (range, body, contentRange) => {
    const { app } = await setup()
    const response = await request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.txt' }).set('Range', range).expect(206)
    expect(response.text).toBe(body)
    expect(response.headers['content-range']).toBe(contentRange)
    expect(response.headers['content-length']).toBe(String(body.length))
  })

  it.each(['bytes=10-', 'bytes=20-30', 'bytes=5-2', 'bytes=-0'])('不可满足的 Range %s 返回 416', async (range) => {
    const { app, session } = await setup()
    const response = await request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.txt' }).set('Range', range).expect(416)
    expect(response.headers['content-range']).toBe('bytes */10')
    expect(session.createReadStream).not.toHaveBeenCalled()
    expect(session.close).toHaveBeenCalledOnce()
  })

  it.each(['items=0-1', 'bytes=oops', 'bytes=1x-2y', 'bytes=0-1,5-6', 'bytes=20-30,40-50', 'bytes='])('忽略非法、未知或多段 Range %s', async (range) => {
    const { app } = await setup()
    const response = await request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.txt' }).set('Range', range).expect(200)
    expect(response.text).toBe(content.toString())
    expect(response.headers['content-range']).toBeUndefined()
  })

  it.each([
    [etag, 206, '12'],
    ['"another-file"', 200, '0123456789'],
    [`W/${etag}`, 200, '0123456789'],
    ['Tue, 15 Nov 1994 12:45:26 GMT', 200, '0123456789'],
  ])('If-Range %s 仅在 ETag 完全匹配时返回范围', async (ifRange, status, body) => {
    const { app } = await setup()
    const response = await request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.txt' }).set('Range', 'bytes=1-2').set('If-Range', ifRange).expect(status)
    expect(response.text).toBe(body)
  })

  it('零字节文件正常读取，字节范围不可满足', async () => {
    const { app, session } = await setup(Buffer.alloc(0))
    await request(app.getHttpServer()).get(fileUrl).query({ path: '/empty.txt' }).expect(200).expect('Content-Length', '0')
    await request(app.getHttpServer()).get(fileUrl).query({ path: '/empty.txt' }).set('Range', 'bytes=0-').expect(416).expect('Content-Range', 'bytes */0')
    expect(session.createReadStream).not.toHaveBeenCalled()
  })

  it.each([
    { path: '../movie.txt' },
    { path: '/movie.txt', driveVersion: 0 },
    { path: '/movie.txt', driveVersion: 'oops' },
    { path: '/movie.txt', driveVersion: 1.5 },
    { path: '/movie.txt', disposition: 'other' },
  ])('拒绝非法参数 %j', async (query) => {
    const { app, openReadSession } = await setup()
    await request(app.getHttpServer()).get(fileUrl).query(query).expect(400)
    expect(openReadSession).not.toHaveBeenCalled()
  })

  it('拒绝非法 Drive key，空版本视为未指定', async () => {
    const { app, openReadSession } = await setup()
    await request(app.getHttpServer()).get('/v1/files/invalid').query({ path: '/movie.txt' }).expect(400)
    await request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.txt', driveVersion: '' }).expect(200)
    expect(openReadSession).toHaveBeenCalledExactlyOnceWith(driveKey, { driveVersion: undefined, signal: expect.any(AbortSignal) })
  })

  it.each([400, 404, 409, 503, 504])('元数据读取失败映射为 %i 并释放 session', async (status) => {
    const { app, session } = await setup()
    session.getFile.mockRejectedValue(readError(status, 'file-error'))
    await request(app.getHttpServer()).get(fileUrl).query({ path: '/' }).expect(status).expect({ statusCode: status, code: 'file-error', message: '读取失败。' })
    expect(session.close).toHaveBeenCalledOnce()
    expect(session.createReadStream).not.toHaveBeenCalled()
  })

  it('首块等待超时在响应头提交前返回 JSON 错误', async () => {
    const { app, session } = await setup()
    session.createReadStream.mockImplementation(() => new Readable({ read() { this.destroy(readError(504, 'read-timeout')) } }))
    const response = await request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.mp4' }).expect(504)
    expect(response.body).toMatchObject({ code: 'read-timeout', statusCode: 504 })
    expect(response.headers['content-type']).toMatch(/^application\/json/u)
    expect(session.close).toHaveBeenCalledOnce()
  })

  it('非空文件没有正文时在提交响应头前返回 503', async () => {
    const { app, session } = await setup()
    session.createReadStream.mockReturnValue(Readable.from([]))
    const response = await request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.mp4' }).expect(503)
    expect(response.headers['content-type']).toMatch(/^application\/json/u)
    expect(session.close).toHaveBeenCalledOnce()
  })

  it.each([undefined, 'bytes=2-3'])('首块超出 %s 声明的长度时返回 503，避免写入多余字节', async (range) => {
    const { app, session } = await setup()
    session.createReadStream.mockReturnValue(Readable.from([Buffer.alloc(range ? 3 : 11)]))
    const client = request(app.getHttpServer()).get(fileUrl).query({ path: '/movie.mp4' })
    if (range) client.set('Range', range)
    const response = await client.expect(503)
    expect(response.body).toMatchObject({ code: 'content-unavailable', statusCode: 503 })
    expect(response.headers['content-type']).toMatch(/^application\/json/u)
    expect(response.headers['content-range']).toBeUndefined()
    expect(session.close).toHaveBeenCalledOnce()
  })

  it.each([
    [undefined, false],
    [undefined, true],
    ['bytes=2-3', false],
    ['bytes=2-3', true],
  ])('传输 %s 中途出现超长=%s 的正文时中断连接', async (range, oversized) => {
    const { app, session } = await setup()
    const source = new Readable({ read() {} })
    source.push(Buffer.from('0'))
    session.createReadStream.mockReturnValue(source)
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      get(`http://127.0.0.1:${address.port}${fileUrl}?path=/movie.txt`, {
        headers: range ? { Range: range } : {},
      }, resolve).once('error', reject)
    })
    const chunks: Buffer[] = []
    response.on('data', (chunk: Buffer) => chunks.push(chunk))
    const aborted = once(response, 'aborted')
    if (oversized) source.push(Buffer.alloc(range ? 2 : 10))
    source.push(null)
    await aborted
    expect(response.statusCode).toBe(range ? 206 : 200)
    expect(Buffer.concat(chunks).toString()).toBe('0')
    await vi.waitFor(() => expect(session.close).toHaveBeenCalledOnce())
  })

  it('PDF 正文与范围字节保持原样并返回预览所需的 MIME', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n')
    const { app } = await setup(pdf)
    const full = await request(app.getHttpServer()).get(fileUrl).query({ path: '/document.pdf' }).expect(200)
    expect(full.headers['content-type']).toBe('application/pdf')
    expect(full.headers['content-disposition']).toBe('inline; filename="document.pdf"')
    expect(full.body).toEqual(pdf)
    const partial = await request(app.getHttpServer()).get(fileUrl).query({ path: '/document.pdf' }).set('Range', 'bytes=0-7').expect(206)
    expect(partial.body).toEqual(pdf.subarray(0, 8))
    expect(partial.headers['content-range']).toBe(`bytes 0-7/${pdf.length}`)
  })

  it('传输开始后发生错误只中断连接', async () => {
    const { app, session } = await setup()
    let source: Readable
    session.createReadStream.mockImplementation(() => {
      let sent = false
      source = new Readable({ read() { if (!sent) { sent = true; this.push(Buffer.from('0')) } } })
      return source
    })
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      get(`http://127.0.0.1:${address.port}${fileUrl}?path=/movie.txt`, resolve).once('error', reject)
    })
    const aborted = once(response, 'aborted')
    response.resume()
    source!.destroy(readError(504, 'read-timeout'))
    await aborted
    expect(response.statusCode).toBe(200)
    await vi.waitFor(() => expect(session.close).toHaveBeenCalledOnce())
  })

  it('首块等待期间客户端断连会取消读取并关闭本次 session', async () => {
    const { app, session, openReadSession } = await setup()
    const source = new Readable({ read() {} })
    session.createReadStream.mockReturnValue(source)
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    const client = get(`http://127.0.0.1:${address.port}${fileUrl}?path=/movie.txt`)
    client.on('error', () => {})
    await vi.waitFor(() => expect(session.createReadStream).toHaveBeenCalledOnce())
    client.destroy()
    await vi.waitFor(() => expect(session.close).toHaveBeenCalledOnce())
    expect(source.destroyed).toBe(true)
    expect(openReadSession.mock.calls[0]?.[1].signal?.aborted).toBe(true)
  })

  it('慢消费者保留背压，客户端断连后停止上游', async () => {
    const { app, session } = await setup()
    let generated = 0
    const source = new Readable({
      highWaterMark: 64 * 1024,
      read() {
        generated += 64 * 1024
        this.push(Buffer.alloc(64 * 1024))
      },
    })
    session.getFile.mockResolvedValue({ path: '/large.mp4', type: 'file', size: 1024 * 1024 * 1024, etag })
    session.createReadStream.mockReturnValue(source)
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      get(`http://127.0.0.1:${address.port}${fileUrl}?path=/large.mp4`, resolve).once('error', reject)
    })
    response.on('error', () => {})
    response.pause()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(generated).toBeLessThan(64 * 1024 * 1024)
    response.destroy()
    await vi.waitFor(() => expect(session.close).toHaveBeenCalledOnce())
    const afterClose = generated
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(generated).toBe(afterClose)
    expect(source.destroyed).toBe(true)
  })

  it('并发请求各自持有 session，完成一个读取不会关闭另一个读取', async () => {
    const { app, session, openReadSession } = await setup()
    const pendingSource = new Readable({ read() {} })
    const pendingSession = {
      ...session,
      createReadStream: vi.fn(() => pendingSource),
      close: vi.fn(async () => {}),
    }
    openReadSession.mockResolvedValueOnce(pendingSession)
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address() as AddressInfo
    const waitingClient = get(`http://127.0.0.1:${address.port}${fileUrl}?path=/waiting.txt`)
    waitingClient.on('error', () => {})
    await vi.waitFor(() => expect(pendingSession.createReadStream).toHaveBeenCalledOnce())
    await request(app.getHttpServer()).get(fileUrl).query({ path: '/ready.txt' }).expect(200)
    expect(session.close).toHaveBeenCalledOnce()
    expect(pendingSession.close).not.toHaveBeenCalled()
    expect(pendingSource.destroyed).toBe(false)
    waitingClient.destroy()
    await vi.waitFor(() => expect(pendingSession.close).toHaveBeenCalledOnce())
    expect(openReadSession.mock.calls[0]?.[1].signal?.aborted).toBe(true)
    expect(openReadSession.mock.calls[1]?.[1].signal?.aborted).toBe(false)
  })

  it('OpenAPI 包含二进制响应、Range、错误状态和固定版本参数', async () => {
    const { app } = await setup()
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, new DocumentBuilder().build()))
    const operations = document.paths['/v1/files/{driveKey}']!
    const getOperation = operations.get!
    expect(getOperation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Range', in: 'header' }),
      expect.objectContaining({ name: 'If-Range', in: 'header' }),
      expect.objectContaining({ name: 'driveVersion', in: 'query', required: false }),
      expect.objectContaining({ name: 'disposition', in: 'query', required: false }),
    ]))
    expect(getOperation.responses['200']).toMatchObject({
      content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
      headers: { ETag: expect.anything(), 'X-Drive-Version': expect.anything(), 'Accept-Ranges': expect.anything() },
    })
    for (const code of ['206', '400', '404', '409', '416', '503', '504']) expect(getOperation.responses[code]).toBeDefined()
    expect(operations.head!.responses['200']).not.toHaveProperty('content')
  })
})
