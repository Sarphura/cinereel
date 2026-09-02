import { afterEach, describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { Readable } from 'node:stream'
import request from 'supertest'
import {
  cleanupOpenApiDoc,
  ZodSerializerInterceptor,
  ZodValidationPipe,
} from 'nestjs-zod'
import { FileController } from '../src/hyper.api/controller/files/file.controller.js'
import { FileService } from '../src/hyper.implementation/file.service.js'

const zodProviders = [
  { provide: APP_PIPE, useClass: ZodValidationPipe },
  { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
]

describe('FileController', () => {
  let app: INestApplication | undefined

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

    app = moduleRef.createNestApplication()
    await app.init()

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

  it('拒绝不符合响应 DTO 的目录结果', async () => {
    const driveKey = 'a'.repeat(64)
    const listDirectory = vi.fn(async () => ({
      path: '/',
      driveVersion: 'invalid',
      entries: [],
      nextCursor: null,
    }))
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: { listDirectory } },
        ...zodProviders,
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useLogger(false)
    await app.init()

    await request(app.getHttpServer())
      .get(`/v1/files/${driveKey}/entries`)
      .query({ path: '/' })
      .expect(500)
  })

  it('从 Zod 契约生成目录接口的 OpenAPI 参数和响应', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: {} },
        ...zodProviders,
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()

    const document = cleanupOpenApiDoc(
      SwaggerModule.createDocument(app, new DocumentBuilder().build()),
    )
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
              $ref: '#/components/schemas/ListDirectoryResponseDto_Output',
            },
          }),
        }),
      }),
    )
    expect(
      document.components?.schemas?.ListDirectoryResponseDto_Output,
    ).toEqual(
      expect.objectContaining({
        required: ['path', 'driveVersion', 'entries', 'nextCursor'],
        properties: expect.objectContaining({
          nextCursor: { type: 'string', nullable: true },
          entries: expect.objectContaining({
            items: expect.objectContaining({
              properties: expect.objectContaining({
                size: { type: 'number', nullable: true },
              }),
            }),
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

    app = moduleRef.createNestApplication({ bodyParser: false })
    await app.init()

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
})
