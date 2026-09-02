import { afterEach, describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { Readable } from 'node:stream'
import request from 'supertest'
import { FileController } from '../src/hyper.api/controller/files/file.controller.js'
import { FileService } from '../src/hyper.implementation/file.service.js'

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
      providers: [{ provide: FileService, useValue: { listDirectory } }],
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
      providers: [{ provide: FileService, useValue: { addFile } }],
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
