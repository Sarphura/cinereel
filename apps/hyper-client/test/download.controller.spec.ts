import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc, ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { DownloadTaskController } from '../src/hyper.api/controller/downloads/download.controller.js'
import { DownloadTaskService } from '../src/hyper.implementation/download-task.service.js'
import { DownloadTaskStore } from '../src/hyper.implementation/download-task.store.js'
import type { FileService } from '../src/hyper.implementation/file.service.js'
import { DriveActivity } from '../src/hyper.infrastructure/sdk/drive-activity.js'

const input = { driveKey: 'a'.repeat(64), path: '/movie.mp4', targetType: 'file' }

describe('DownloadTaskController', () => {
  let app: INestApplication
  let service: DownloadTaskService
  let directory: string
  let path: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cinereel-download-http-'))
    path = join(directory, 'download-tasks.json')
    const files = {
      openReadSession: async () => ({
        driveVersion: 4, driveFork: 0, contentFork: 0,
        prepareContent: async () => 0,
        getFile: async (filePath: string) => ({ path: filePath, type: 'file', size: 10, etag: 'etag' }),
        entries: async function* () {},
        createReadStream: () => new Readable({ read() {} }),
        hasFile: async () => false,
        close: async () => undefined,
      }),
    } as unknown as FileService
    service = new DownloadTaskService(files, new DriveActivity(), { storagePath: path, timeoutMs: 5_000 })
    const module = await Test.createTestingModule({
      controllers: [DownloadTaskController],
      providers: [
        { provide: DownloadTaskService, useValue: service },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    }).compile()
    app = module.createNestApplication()
    app.useLogger(false)
    await app.init()
  })

  afterEach(async () => {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('创建返回 202 且已落盘，重复提交返回相同任务，冲突返回 409', async () => {
    const created = await request(app.getHttpServer()).post('/v1/downloads')
      .set('Idempotency-Key', 'create').send(input).expect(202)
    expect(created.body).toMatchObject({ ...input, status: 'queued', driveVersion: null })
    expect((await new DownloadTaskStore(path).read())[0]?.id).toBe(created.body.id)
    const replay = await request(app.getHttpServer()).post('/v1/downloads')
      .set('Idempotency-Key', 'create').send(input).expect(202)
    expect(replay.body.id).toBe(created.body.id)
    await request(app.getHttpServer()).post('/v1/downloads')
      .set('Idempotency-Key', 'create').send({ ...input, path: '/different.mp4' }).expect(409)
  })

  it('校验幂等请求头、Drive key、路径、版本和未声明参数', async () => {
    await request(app.getHttpServer()).post('/v1/downloads').send(input).expect(400)
    for (const body of [
      { ...input, driveKey: 'invalid' }, { ...input, path: '/../movie.mp4' },
      { ...input, path: '/' }, { ...input, driveVersion: 0 },
      { ...input, destination: '/tmp/export' },
    ]) {
      await request(app.getHttpServer()).post('/v1/downloads')
        .set('Idempotency-Key', 'invalid').send(body).expect(400)
    }
    await request(app.getHttpServer()).get('/v1/downloads/not-a-uuid').expect(400)
    await request(app.getHttpServer()).get('/v1/downloads/00000000-0000-4000-8000-000000000000').expect(404)
  })

  it('分页、详情和暂停继续取消响应符合统一任务契约', async () => {
    const first = await request(app.getHttpServer()).post('/v1/downloads')
      .set('Idempotency-Key', 'first').send(input).expect(202)
    const second = await request(app.getHttpServer()).post('/v1/downloads')
      .set('Idempotency-Key', 'second').send(input).expect(202)
    const page = await request(app.getHttpServer()).get('/v1/downloads').query({ limit: 1 }).expect(200)
    expect(page.body.tasks[0].id).toBe(first.body.id)
    expect(page.body.nextCursor).toBe(first.body.id)
    const next = await request(app.getHttpServer()).get('/v1/downloads')
      .query({ cursor: page.body.nextCursor, limit: 1 }).expect(200)
    expect(next.body).toMatchObject({ tasks: [{ id: second.body.id }], nextCursor: null })
    await request(app.getHttpServer()).get('/v1/downloads').query({ limit: 501 }).expect(400)
    await request(app.getHttpServer()).get(`/v1/downloads/${first.body.id}`).expect(200)
    await vi.waitFor(() => expect(service.getTask(first.body.id).driveVersion).toBe(4))
    const paused = await request(app.getHttpServer()).post(`/v1/downloads/${first.body.id}/pause`).expect(200)
    expect(paused.body.status).toBe('paused')
    const resumed = await request(app.getHttpServer()).post(`/v1/downloads/${first.body.id}/resume`).expect(200)
    expect(resumed.body.status).toBe('queued')
    const canceled = await request(app.getHttpServer()).post(`/v1/downloads/${first.body.id}/cancel`).expect(200)
    expect(canceled.body.status).toBe('canceled')
    await request(app.getHttpServer()).post(`/v1/downloads/${first.body.id}/retry`).expect(409)
  })

  it('OpenAPI 声明创建 202、必填幂等请求头和全部控制端点', async () => {
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, new DocumentBuilder().build()))
    const create = document.paths['/v1/downloads']?.post
    expect(create?.responses['202']).toBeDefined()
    for (const status of ['400', '409', '503']) expect(create?.responses[status]).toBeDefined()
    expect(create?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ in: 'header', name: 'Idempotency-Key', required: true }),
    ]))
    for (const command of ['pause', 'resume', 'cancel', 'retry']) {
      for (const status of ['200', '400', '404', '409', '503']) {
        expect(document.paths[`/v1/downloads/{id}/${command}`]?.post?.responses[status]).toBeDefined()
      }
    }
    expect(document.components?.schemas?.DownloadTaskResponseDto_Output).toBeDefined()
  })
})
