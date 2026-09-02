/**
 * Hyper Client entry point — NestJS bootstrap on Express adapter.
 */
import 'dotenv/config'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import express from 'express'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import { AppModule } from './app.module.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3000

async function main(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production'
  const host = process.env.HOST || DEFAULT_HOST
  const port = Number(process.env.PORT || DEFAULT_PORT)

  // ── 1. Create Nest app ─────────────────────────────────────────
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(),
    { bodyParser: false, bufferLogs: true },
  )

  // ── 2. CORS ────────────────────────────────────────────────────
  app.enableCors({
    origin: ['http://127.0.0.1:5237', 'http://localhost:5237'],
    credentials: true,
  })

  // ── 3. Body parsers ────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))

  // ── 4. OpenAPI doc ─────────────────────────────────────────────
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('Hyper Client API')
      .setDescription('Hyper SDK REST API for Cinereel')
      .setVersion('0.0.2')
      .build()
    
    const document = cleanupOpenApiDoc(
      SwaggerModule.createDocument(app, config),
    )
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    })
  }

  // ── 5. Listen ───────────────────────────────────────────────────
  await app.listen(port, host)
  console.log(`[hyper-client] listening on ${host}:${port} (NODE_ENV=${process.env.NODE_ENV || 'development'})`)
  console.log(`[hyper-client] Swagger UI: http://${host}:${port}/docs`)

  // ── 6. Graceful shutdown ───────────────────────────────────────
  const shutdown = async (sig: NodeJS.Signals): Promise<void> => {
    console.log(`[hyper-client] ${sig} received, shutting down…`)
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
