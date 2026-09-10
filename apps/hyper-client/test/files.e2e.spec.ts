import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Writable } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import request from 'supertest'
import { SDK } from 'hyper-sdk'
import { AppModule } from '../src/app.module.js'

describe('FileController e2e', () => {
  let app: NestFastifyApplication
  let storagePath: string
  let originalConfigDir: string | undefined
  const files = new Map<string, Buffer>()

  beforeEach(async () => {
    files.clear()
    originalConfigDir = process.env.CONFIG_DIR
    storagePath = await mkdtemp(join(tmpdir(), 'cinereel-hyper-client-'))
    process.env.CONFIG_DIR = storagePath

    const drive = {
      writable: true,
      async entry(path: string): Promise<object | null> {
        return files.has(path) ? {} : null
      },
      async del(path: string): Promise<void> {
        files.delete(path)
      },
      async *list(path: string): AsyncGenerator<{ key: string }> {
        const prefix = path === '/' ? '/' : `${path}/`
        for (const key of [...files.keys()]
          .filter((filePath) => filePath.startsWith(prefix))
          .sort()) {
          yield { key }
        }
      },
      createWriteStream(path: string): Writable {
        const chunks: Buffer[] = []
        return new Writable({
          write(chunk: Buffer, _encoding, callback) {
            chunks.push(Buffer.from(chunk))
            callback()
          },
          final: (callback) => {
            files.set(path, Buffer.concat(chunks))
            callback()
          },
        })
      },
    }
    const sdk = { getDrive: async () => drive, close: async () => undefined } as unknown as SDK

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot()],
    })
      .overrideProvider(SDK)
      .useValue(sdk)
      .compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    ;(app.getHttpAdapter() as FastifyAdapter).getInstance().addContentTypeParser('application/octet-stream', (_req: any, body: any, done: any) => done(null, body))
    await app.init()
    await (app.getHttpAdapter() as FastifyAdapter).getInstance().ready()
  })

  afterEach(async () => {
    await app.close()
    if (originalConfigDir === undefined) {
      delete process.env.CONFIG_DIR
    } else {
      process.env.CONFIG_DIR = originalConfigDir
    }
    await rm(storagePath, { recursive: true, force: true })
  })

  it('把 octet-stream body 写入文件', async () => {
    const res = await request(app.getHttpServer())
      .put(`/v1/files/${'a'.repeat(64)}?path=/foo.txt`)
      .set('Content-Type', 'application/octet-stream')
      .send('hello')

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ ok: true })
    expect(files.get('/foo.txt')?.toString()).toBe('hello')
  })

  it('非法 driveKey 返回 400', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/files/not-hex?path=/foo.txt')
      .set('Content-Type', 'application/octet-stream')
      .send('hello')

    expect(res.status).toBe(400)
    expect(files.size).toBe(0)
  })

  it('删除已存在的文件', async () => {
    files.set('/foo.txt', Buffer.from('hello'))

    const res = await request(app.getHttpServer())
      .delete(`/v1/files/${'a'.repeat(64)}?path=/foo.txt`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(files.has('/foo.txt')).toBe(false)
  })

  it('删除不存在的文件返回 404', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/files/${'a'.repeat(64)}?path=/missing.txt`)

    expect(res.status).toBe(404)
    expect(files.size).toBe(0)
  })

  it('递归删除目录', async () => {
    files.set('/movies/a.mp4', Buffer.from('a'))
    files.set('/movies/b.mp4', Buffer.from('b'))
    files.set('/keep.txt', Buffer.from('keep'))

    const res = await request(app.getHttpServer())
      .delete(`/v1/files/${'a'.repeat(64)}/entries?path=/movies`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(files.has('/movies/a.mp4')).toBe(false)
    expect(files.has('/movies/b.mp4')).toBe(false)
    expect(files.has('/keep.txt')).toBe(true)
  })
})
