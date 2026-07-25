# Hyper Agent startup: load core modules → mount drives → bind HTTP, in that order

The Hyper Agent's startup sequence:

1. `main.ts` runs `NestFactory.create(AppModule)`. NestJS wires modules and providers but does not yet bind the HTTP listener.
2. `CoreConfigModule` validates environment variables.
3. `CoreSdkModule.forRootAsync()` constructs the hyper-sdk binding to `<data-dir>/corestore/`.
4. `BootstrapService.onModuleInit()` runs:
   - Loads `drive-index.json` from disk.
   - Opens the main drive (UUID = `MAIN_NAMESPACE`), registers it in `DriveRegistry`.
   - Iterates persisted non-main UUIDs and reopens them.
   - Calls `swarmService.announce(true)` to seed the Hyperswarm DHT.
5. After `onModuleInit` returns, `main.ts` calls `app.listen({ host: '127.0.0.1', port: SIDECAR_PORT })`.
6. The App Server's polling of `GET /health` then returns 200 OK, the version check (ADR 0033) runs, and the App Server begins its own HTTP listener.

## Context

The Hyper Agent's startup needs to be deterministic and observable. The App Server polls `/health` and only proceeds when that returns 200, so the Hyper Agent must signal readiness at the right moment.

Two plausible shapes:

- **Strict order** — sequential init: Corestore ready → drives mounted → HTTP listener bound. Predictable but takes ~2-5 seconds total.
- **Lazy start** — HTTP listener binds immediately; drives are mounted on first request.

## Decision

Strict order. The drives must be mounted *before* the HTTP listener binds so that the first request can already find them in `DriveRegistry`. The dht announce is best-effort — its failure does not block startup.

### Why drives must be mounted first

A request like `GET /v1/subscriptions/abc...` immediately tries to look up the subscription's drive in `DriveRegistry`. If the registry is empty at request time, the request fails with `DriveNotMountedError`. The user experience would be: "subscribed successfully → first refresh → 404 → wait → refresh again → 200". We prefer: "subscribed successfully → first refresh → 200".

### Why HTTP bind last

The App Server's `/health` polling (ADR 0017) returns 200 only after bind. We want bind to be after all bootstrap work, so `/health` returning 200 implies "drives ready, DHT seed attempted".

### What's allowed to fail silently

- `swarmService.announce(true)` — DHT seeding failure is logged as a warn but does not block startup. DHT can recover later as peers reconnect.

### What's NOT allowed to fail silently

- `sdk = create(...)` — if Corestore creation fails (e.g. disk full, permissions), exit 77.
- `coreSdkModule` — if any required dependency injection fails, exit 78.
- `drive-index.load()` — if the index file is corrupt, exit 79 and require operator intervention.
- `mount main drive` — if this fails, exit 80.

### Implementation

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] })
  await app.init()  // Runs onModuleInit lifecycle hooks
  await app.listen({ host: '127.0.0.1', port: parseInt(process.env.SIDECAR_PORT ?? '4201') })
}

bootstrap().catch(err => {
  console.error('hyper-agent bootstrap failed:', err)
  process.exit(1)
})
```

Nest's `app.init()` blocks until all `onModuleInit` hooks complete. Only then does `app.listen` bind.

## Trade-off accepted

- Total startup is slower (~3-5 seconds) than a "bind immediately, mount lazily" shape.
- A failure during drive remount means the whole Hyper Agent exits, even if some drives mounted successfully. Acceptable for V1's small drive counts.