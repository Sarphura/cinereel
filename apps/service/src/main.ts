import multipart from '@fastify/multipart'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

/**
 * bootstrap
 *
 * 职责：创建 NestJS 应用实例并挂载全局中间件/插件。
 *   - 使用 Fastify 适配器（高性能 HTTP 层）
 *   - 启用 Swagger / OpenAPI 文档（仅非生产环境）
 *   - 监听端口（由环境变量 PORT 控制，默认 3000）
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Profile API 以 Data URL 接收头像；允许不超过 5 MB 图片的 Base64 开销。
    new FastifyAdapter({ logger: true, bodyLimit: 7 * 1024 * 1024 }),
  )

  // ---------------------------------------------------------------------------
  // Multipart（文件上传）
  // ---------------------------------------------------------------------------

  // 注册 @fastify/multipart，支持 multipart/form-data 请求（文件上传）。
  // fileSize 限制单文件最大 100 MB。
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 },
  })

  // ---------------------------------------------------------------------------
  // Swagger / OpenAPI
  // ---------------------------------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Cinereel Service API')
      .setDescription(
        '基于 Hyperdrive P2P 的文件存储与分发服务 API 文档。\n\n' +
          '- **file** — 文件上传/下载/管理\n' +
          '- **drive** — P2P 节点连接与远端 drive 挂载',
      )
      .setVersion('0.1.0')
      .addTag('file', '业务级文件操作（上传、下载、列举）')
      .addTag('drive', 'P2P 网络与 Drive 管理（宣告、挂载）')
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/json',
      yamlDocumentUrl: 'docs/yaml',
    })
  }

  // ---------------------------------------------------------------------------
  // 启动
  // ---------------------------------------------------------------------------

  const port = Number(process.env.PORT ?? 3000)
  const host = process.env.HOST ?? '0.0.0.0'

  await app.listen(port, host)
}

bootstrap()
