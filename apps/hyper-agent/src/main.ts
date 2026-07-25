/**
 * Hyper Agent entry point — NestJS bootstrap on Express adapter.
 *
 * ── Startup contract (ADR 0017, ADR 0048, ADR 0055) ─────────────────────
 * The Application Server spawns this process and waits for `/healthz` to
 * return 200 before it proceeds with its own listener bind. The sequence
 * in `main()` is the contract; reordering any of these steps changes the
 * readiness signal the App Server sees.
 *
 *   1. Bootstrap (pre-Nest: load config + keys).
 *        Failure: throws synchronously and exits via the catch in
 *        `main().catch(...)` below — Node exits 1 (the constants for
 *        explicit failure modes live in infrastructure/exit-codes.ts and
 *        are wired in by ticket 16).
 *   2. Nest app construction (`NestFactory.create`).
 *        Failure: NestFactory.create logs and throws; we exit 1.
 *   3. CORS + body parsers (express.json + express.raw).
 *        Failure: would only happen if Express itself failed to register;
 *        treated as 1.
 *   4. Global filter (HttpExceptionFilter).
 *        Failure: would only happen if a constructor threw; treated as 1.
 *   5. OpenAPI document builder (SwaggerModule.createDocument).
 *        Failure: ditto.
 *   6. `app.listen({ host: '127.0.0.1', port: SIDECAR_PORT })`.
 *        Failure: EADDRINUSE → 73 (`EXIT_PORT_IN_USE`); other listen
 *        errors → 1. This is the **readiness signal** the App Server
 *        polls: it waits for `GET /healthz` to return 200, which only
 *        becomes possible after this step succeeds AND step 4 of the
 *        BootstrapService comment below completes.
 *   7. SIGTERM/SIGINT handlers → graceful `app.close()` then exit 0.
 *
 * Read also:
 *   - `infrastructure/exit-codes.ts` for the full numeric exit-code table
 *     and the Application Server's spawn-watch action per code.
 *   - `apps/service/Infrastructure/HyperAgent/HyperAgentSpawnConfig.cs`
 *     for the spawn contract on the App Server side.
 *
 * Wires:
 *   - CORS via app.enableCors()
 *   - JSON body parser (express.json) for /v1/auth + drives CRUD
 *   - RAW body parser (express.raw) for PUT /v1/drives/:key/file
 *   - Global HttpExceptionFilter (RFC 9457 ProblemDetails envelope)
 *   - @nestjs/swagger DocumentBuilder → Swagger UI (dev mode only)
 *   - Signal handlers for graceful shutdown (sdk.close via OnModuleDestroy)
 */
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import express from 'express'
import { SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import { HttpExceptionFilter } from './core/common/filters/http-exception.filter.js'
import { RAW_BODY_KEY } from './core/common/middleware/raw-body.middleware.js'
import { buildOpenAPI } from './core/swagger/swagger-setup.js'
import { ensureSwaggerPatch } from './core/common/zod/schema-registry.js'
import { loadApiKeys } from './auth/keys.js'

async function main(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production'

  // ── 1. Bootstrap (pre-Nest: load config + keys) ─────────────────
  // We need the ConfigService after NestFactory.create() to read host/port,
  // but loadApiKeys needs Config (or process.env directly) at startup. We
  // do an early loadConfig() so loadApiKeys can run before Nest boots.
  const { loadConfig } = await import('./config-loader.js')
  const cfg = loadConfig()
  loadApiKeys(cfg)

  if (!isProd) {
    // eslint-disable-next-line no-console
    console.warn(
      `[sidecar] dev instance at ${cfg.host}:${cfg.port} expects ` +
        `X-Sidecar-Token: ${cfg.token}`,
    )
  }

  // ── 2. Nest app (Express adapter by default) ───────────────────
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  })
  // nestjs-pino is already registered as a global Logger (LoggerModule in
  // CoreLoggerModule), so the default Nest logger wrapper is replaced with
  // the pino one without needing the deprecated `app.useLogger(Logger)` here.

  // ── 3. CORS ────────────────────────────────────────────────────
  app.enableCors({
    origin: ['http://127.0.0.1:5237', 'http://localhost:5237'],
    credentials: true,
  })

  // ── 4. Body parsers ────────────────────────────────────────────
  // JSON for /v1/auth + /v1/drives (POST/DELETE) + swarm routes
  app.use(express.json({ limit: '1mb' }))
  // Raw octet-stream for PUT /v1/drives/:key/file
  app.use(
    '/v1/drives',
    express.raw({ type: 'application/octet-stream', limit: '500mb' }),
    (req: unknown, _res: unknown, next: () => void) => {
      ;(req as Record<symbol, Buffer>)[RAW_BODY_KEY] = (req as { body: Buffer }).body
      next()
    },
  )

  // ── 5. Global filter ───────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter())

  // ── 6. OpenAPI doc ─────────────────────────────────────────────
  ensureSwaggerPatch()
  const doc = buildOpenAPI(app)
  if (!isProd) {
    SwaggerModule.setup('docs', app, doc, {
      swaggerOptions: { persistAuthorization: true },
    })
  }

  // ── 7. Listen + graceful shutdown ──────────────────────────────
  const listenPort = Number(cfg.port)
  await app.listen(listenPort, cfg.host)
  // eslint-disable-next-line no-console
  console.warn(`[sidecar] listening on ${cfg.host}:${cfg.port} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`)

  const shutdown = async (sig: NodeJS.Signals): Promise<void> => {
    // eslint-disable-next-line no-console
    console.warn(`[sidecar] ${sig} received, shutting down…`)
    try {
      await app.close()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sidecar] app close error:', (err as Error).message)
    }
    process.exit(0)
  }
  process.on('SIGTERM', (s) => void shutdown(s))
  process.on('SIGINT', (s) => void shutdown(s))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[sidecar] fatal:', err)
  process.exit(1)
})
