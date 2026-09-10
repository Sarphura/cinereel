/**
 * Hyper Client entry point — NestJS bootstrap on Fastify adapter.
 */
import 'dotenv/config'
import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3000

async function main(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production'
  const host = process.env.HOST || DEFAULT_HOST
  const port = Number(process.env.PORT || DEFAULT_PORT)
  const logger = new Logger('HyperClient')

  // ── 1. Create Nest app ─────────────────────────────────────────
  // Fastify 内置 pino logger 输出 HTTP 访问日志。JSON 正文默认 1MB 上限；
  // application/octet-stream 无解析器，正文保持原始流供文件上传直接消费。
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(),
    new FastifyAdapter({ logger: true }),
    { bufferLogs: true },
  )

  // ── 2. 原始流正文解析 ──────────────────────────────────────────
  // application/octet-stream 保持为原始流，供文件上传与协议文件直接消费，
  // 不读入内存，也不受 bodyLimit 限制。
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser('application/octet-stream', (_req, body, done) => done(null, body))

  // ── 3. CORS ────────────────────────────────────────────────────
  app.enableCors({
    origin: ['http://127.0.0.1:5237', 'http://localhost:5237'],
    credentials: true,
  })

  // ── 3. OpenAPI doc ─────────────────────────────────────────────
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('Hyper Client API')
      .setDescription('Hyper SDK REST API for Cinereel')
      .setVersion('0.0.2')
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    })
  }

  // ── 4. Listen ───────────────────────────────────────────────────
  await app.listen(port, host)
  logger.log(`listening on ${host}:${port} (NODE_ENV=${process.env.NODE_ENV || 'development'})`)
  logger.log(`Swagger UI: http://${host}:${port}/docs`)

  // ── 5. Graceful shutdown ───────────────────────────────────────
  const shutdown = async (sig: NodeJS.Signals): Promise<void> => {
    logger.log(`${sig} received, shutting down…`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', (s) => void shutdown(s))
  process.on('SIGINT', (s) => void shutdown(s))
}

main().catch((err) => {
  console.error('[hyper-client] fatal:', err)
  process.exit(1)
})
