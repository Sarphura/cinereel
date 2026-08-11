# @cinereel/hyper-client

`hyper-sdk` (Corestore / Hyperdrive / Hyperswarm) REST hyper client for CineReel.
A single Node + NestJS process that exposes hyper SDK operations over a
loopback HTTP API. **Only** consumed by `@cinereel/service` (C# / ASP.NET Core).

## Stack

- Node ≥ 20, TypeScript strict mode
- NestJS 11 + Express adapter + `@nestjs/swagger` 11
- `zod` for env-var config parsing
- The official `hyper-sdk@^6.2.2` npm package wraps Corestore / Hyperdrive / Hyperswarm

## Source layout

The hyper-client is organized into a **three-layer architecture**:

| Layer | Path | Responsibility | Forbidden |
|-------|------|----------------|-----------|
| `hyper.api/` | `src/hyper.api/**` | HTTP entry layer — controllers, DTOs, middleware, decorators, filters, Swagger/OpenAPI | Business logic, data access |
| `hyper.domain/` | `src/hyper.domain/**` | Domain layer — services (business rules), repository interfaces, bootstrap orchestration | Fastify, HTTP, direct SDK calls |
| `hyper.infrastructure/` | `src/hyper.infrastructure/**` | Infrastructure layer — config, logging, SDK wiring, security, persistence implementations, cross-layer types | Business rules |

### Layer details

**hyper.api/** (HTTP adapters)
- `controller/` — feature controllers (drives, files, health, swarm, version)
- `dto/` — data transfer objects (request/response shapes)
- `middleware/` — auth middleware, raw-body middleware
- `decorators/` — parameter decorators (@RawBody, @BodyOptional, @CurrentKeyId)
- `filters/` — exception filters (HttpExceptionFilter)
- `swagger/` — OpenAPI document builder

**hyper.domain/** (business logic)
- `model/` — domain services (DriveService, FileService, SwarmService, DriveRegistry)
- `interface/drives/` — repository interfaces (DriveRepository, DriveIndexRepository, PeerConnectionRepository)
- `bootstrap/` — startup orchestration (BootstrapModule, BootstrapService)

**hyper.infrastructure/** (foundation)
- `config/` — configuration module + env schema
- `logging/` — logger module (pino)
- `sdk/` — SDK module + hyper-sdk re-export boundary
- `security/` — security module + shared-token auth
- `persistence/in-memory/` — in-memory repository implementations for tests
- `types/` — cross-layer types (HyperdriveLike, DTO types, key utilities)
- `exit-codes.ts` — process exit code constants

The composition root (`src/hyper.domain/bootstrap/bootstrap.module.ts`) wires everything together; `src/main.ts` is the entry point.

## Configuration

| Env | Required | Default | Description |
|-----|----------|---------|-------------|
| `SIDECAR_TOKEN` | ✓ in production | dev placeholder in dev mode (logs a warning) | Static token used in `X-Sidecar-Token` header. Must be ≥16 chars in production. |
| `SIDECAR_PORT` | | `4321` | Listening port |
| `SIDECAR_HOST` | | `127.0.0.1` | Listening host (loopback only) |
| `SIDECAR_STORE_DIR` | | `./.sidecar-store` | Corestore persistence directory |
| `SIDECAR_SWARM_PORT` | | `0` (random UDP) | Hyperswarm UDP port |
| `SIDECAR_BOOTSTRAP` | | — | Comma-separated bootstrap multiaddrs |
| `SIDECAR_LOG_LEVEL` | | `info` | pino log level |
| `SIDECAR_SHUTDOWN_TIMEOUT_MS` | | `30000` | Graceful shutdown deadline |

## Development

```bash
pnpm install
SIDECAR_TOKEN=$(openssl rand -hex 32) pnpm --filter @cinereel/hyper-client dev
```

```bash
curl -H "X-Sidecar-Token: $SIDECAR_TOKEN" http://127.0.0.1:4321/v1/identity
```

## Testing

```bash
pnpm --filter @cinereel/hyper-client test
```

## Production build

```bash
pnpm --filter @cinereel/hyper-client build && node --enable-source-maps dist/main.js
```