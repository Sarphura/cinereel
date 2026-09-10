import { afterEach, describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Readable } from 'node:stream'
import request from 'supertest'
import { FileController } from '../src/controller/files/file.controller.js'
import { FileResponseWriter } from '../src/controller/files/file-response.writer.js'
import { FileService } from '../src/service/file.service.js'

const zodProviders = [
  { provide: APP_PIPE, useValue: new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }) },
  { provide: FileResponseWriter, useValue: { write: vi.fn() } },
]

describe('FileController', () => {
  let app: NestFastifyApplication | undefined

  afterEach(async () => {
    await app?.close()
  })

  it('把空的可选查询参数视为未提供', async () => {
    const driveKey = 'a'.repeat(64)
    const result = {
      path: '/',
      driveVersion: 7,
      entries: [
        {
          path: '/action',
          name: 'action',
          type: 'directory' as const,
          size: null,
        },
      ],
      nextCursor: null,
    }
    const listDirectory = vi.fn(async () => result)
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: { listDirectory } },
        ...zodProviders,
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    ;(app.getHttpAdapter() as FastifyAdapter).getInstance().addContentTypeParser('application/octet-stream', (_req: any, body: any, done: any) => done(null, body))
    await app.init()
    await (app.getHttpAdapter() as FastifyAdapter).getInstance().ready()

    await request(app.getHttpServer())
      .get(`/v1/files/${driveKey}/entries`)
      .query({ path: '/', cursor: '', limit: '' })
      .expect(200)
      .expect(result)

    expect(listDirectory).toHaveBeenCalledWith(
      driveKey,
      '/',
      undefined,
      100,
    )
  })

  it('从 Zod 契约生成目录接口的 OpenAPI 参数和响应', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: {} },
        ...zodProviders,
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    ;(app.getHttpAdapter() as FastifyAdapter).getInstance().addContentTypeParser('application/octet-stream', (_req: any, body: any, done: any) => done(null, body))
    await app.init()
    await (app.getHttpAdapter() as FastifyAdapter).getInstance().ready()

    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build())
    const operation = document.paths['/v1/files/{driveKey}/entries']?.get

    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'driveKey',
          in: 'path',
          required: true,
          schema: expect.objectContaining({ pattern: '^[0-9a-f]{64}$' }),
        }),
        expect.objectContaining({ name: 'path', required: true }),
        expect.objectContaining({ name: 'cursor', required: false }),
        expect.objectContaining({
          name: 'limit',
          required: false,
          schema: expect.objectContaining({ default: 100, maximum: 500 }),
        }),
      ]),
    )
    expect(operation?.responses?.['200']).toEqual(
      expect.objectContaining({
        content: expect.objectContaining({
          'application/json': expect.objectContaining({
            schema: {
              $ref: '#/components/schemas/ListDirectoryResponseDto',
            },
          }),
        }),
      }),
    )
    expect(document.components?.schemas?.DirectoryEntryResponseDto).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          size: { type: 'number', nullable: true },
        }),
      }),
    )
    expect(
      document.components?.schemas?.ListDirectoryResponseDto,
    ).toEqual(
      expect.objectContaining({
        required: ['path', 'driveVersion', 'entries', 'nextCursor'],
        properties: expect.objectContaining({
          nextCursor: { type: 'string', nullable: true },
          entries: expect.objectContaining({
            type: 'array',
            items: { $ref: '#/components/schemas/DirectoryEntryResponseDto' },
          }),
        }),
      }),
    )
  })

  it('把二进制请求正文作为流完整转发', async () => {
    const driveKey = 'b'.repeat(64)
    const content = Buffer.alloc(16 * 1024 * 1024, 1)
    const receivedChunkSizes: number[] = []
    const addFile = vi.fn(
      async (_driveKey: string, _path: string, input: Readable) => {
        for await (const chunk of input) {
          receivedChunkSizes.push(Buffer.byteLength(chunk))
        }
        return 'created' as const
      },
    )
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: { addFile } },
        ...zodProviders,
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    ;(app.getHttpAdapter() as FastifyAdapter).getInstance().addContentTypeParser('application/octet-stream', (_req: any, body: any, done: any) => done(null, body))
    await app.init()
    await (app.getHttpAdapter() as FastifyAdapter).getInstance().ready()

    await request(app.getHttpServer())
      .put(`/v1/files/${driveKey}`)
      .query({ path: '/video.mp4' })
      .set('Content-Type', 'application/octet-stream')
      .send(content)
      .expect(201)
      .expect({ ok: true })

    expect(addFile).toHaveBeenCalledWith(driveKey, '/video.mp4', expect.anything())
    expect(receivedChunkSizes.reduce((total, size) => total + size, 0)).toBe(
      content.byteLength,
    )
    expect(receivedChunkSizes.length).toBeGreaterThan(1)
  })

  it('递归删除目录并把 deleted 映射为 ok', async () => {
    const driveKey = 'a'.repeat(64)
    const deleteDirectory = vi.fn(async () => 'deleted' as const)
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: { deleteDirectory } },
        ...zodProviders,
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    ;(app.getHttpAdapter() as FastifyAdapter).getInstance().addContentTypeParser('application/octet-stream', (_req: any, body: any, done: any) => done(null, body))
    await app.init()
    await (app.getHttpAdapter() as FastifyAdapter).getInstance().ready()

    await request(app.getHttpServer())
      .delete(`/v1/files/${driveKey}/entries`)
      .query({ path: '/movies' })
      .expect(200)
      .expect({ ok: true })

    expect(deleteDirectory).toHaveBeenCalledWith(driveKey, '/movies')
  })

  it('只读 Drive 的目录删除映射为 403', async () => {
    const driveKey = 'a'.repeat(64)
    const deleteDirectory = vi.fn(async () => 'drive-not-writable' as const)
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: { deleteDirectory } },
        ...zodProviders,
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    ;(app.getHttpAdapter() as FastifyAdapter).getInstance().addContentTypeParser('application/octet-stream', (_req: any, body: any, done: any) => done(null, body))
    await app.init()
    await (app.getHttpAdapter() as FastifyAdapter).getInstance().ready()

    await request(app.getHttpServer())
      .delete(`/v1/files/${driveKey}/entries`)
      .query({ path: '/movies' })
      .expect(403)
  })
})
