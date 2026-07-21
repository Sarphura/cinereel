# @cinereel/sidecar

`hyper-sdk` (Corestore / Hyperdrive / Hyperswarm) REST sidecar for CineReel.
A single Node + Fastify 5 process that exposes hyper SDK operations over a
loopback HTTP API. **Only** consumed by `@cinereel/service` (C# / ASP.NET Core).

## Stack

- Node ≥ 20, TypeScript strict mode
- Fastify 5 (latest) + `@fastify/cors` 11 + `@fastify/swagger` 9 + `@fastify/swagger-ui` 6
- Raw JSON Schema (draft-07) for request/response validation — **not** `fastify-type-provider-zod`. Fastify 5.10 strict mode rejects zod-translated schemas that omit the `required` array; raw JSON schema sidesteps the issue and stays explicit.
- `zod` is used only for env-var config parsing in `src/config/`.
- The official `hyper-sdk@^6.2.2` npm package ([RangerMauve/hyper-sdk](https://github.com/RangerMauve/hyper-sdk)) wraps Corestore / Hyperdrive / Hyperswarm; the sidecar composes a thin service layer (`FileService`, `SwarmService`, `DriveService`) on top so HTTP routes don't have to know about `Hyperdrive` instances.

## Source layout

The sidecar is organized into a five-layer **CSR** (Controllers /
Services / Repositories) architecture plus infrastructure and
middlewares, each with a strict responsibility:

| Layer | Path | Responsibility | Forbidden |
|-------|------|----------------|-----------|
| `infrastructure/` | `src/infrastructure/**` | Cross-layer primitives — DTOs, key codec, `HyperdriveLike` structural type, `SidecarError`. Also holds the single SDK re-export at `infrastructure/sdk/index.ts`. | Business logic, Fastify |
| `repositories/` | `src/repositories/**` | Data access layer. `DriveRepository` (Hyperdrive open/close), `DriveIndexRepository` (persisted metadata), `PeerConnectionRepository` (swarm connections). In-memory fakes under `repositories/in-memory/` for unit tests. | Fastify, business rules |
| `services/` | `src/services/**` | Business rules. `DriveService` (CRUD), `FileService` (file IO with `isRemote` policy), `SwarmService` (network). All `class`-based with constructor injection. | `fastify`, direct SDK calls |
| `controllers/` | `src/controllers/**` | HTTP adapters. Each `*.controller.ts` is a class with a `register(app)` method. Schema bodies live in `controllers/schemas.ts`. | Business rules, data access |
| `middlewares/` | `src/middlewares/**` | Fastify plumbing — `auth.middleware.ts`, `error.middleware.ts`, `server.ts` (`buildServer`), `register-auth.ts` (auth preHandler wiring). | Business rules |
| `bootstrap/` | `src/bootstrap/**` | Composition root (`bootstrap.ts`) + in-memory application state (`DriveRegistry`, kept here because it is shared state, not data access). | Fastify, HTTP wiring |
| `auth/` | `src/auth/**` | Pure crypto primitives — JWT (HS256), API-key registry. | SDK, business rules |
| `config/` | `src/config/**` | zod schema + env loader. | Any business logic |

The composition root (`src/bootstrap/bootstrap.ts`) wires everything together; `src/index.ts` is a thin shell that just calls `loadConfig() → bootstrap() → buildServer() → listen()`.

See [`docs/hyper-sdk-capability-map.md`](../../docs/hyper-sdk-capability-map.md) for a complete "which file does X" map.

## Boundaries

The hyper SDK packages (Corestore / Hyperdrive / Hyperswarm) are **not** a direct
dependency of this package — everything goes through the official `hyper-sdk`
npm package. The boundary is enforced by `scripts/check-sdk-boundary.sh`
(`pnpm --filter @cinereel/sidecar check:sdk-boundary`):

1. Direct `hypercore*` / `hyperdrive*` / `hyperswarm*` / `corestore*` imports
   anywhere under `apps/sidecar/src/**` or `apps/sidecar/test/**` fail the check.
2. `import 'hyper-sdk'` is allowed in **only one** place:
   `src/infrastructure/sdk/index.ts`. Everything else consumes the SDK via that
   re-export.

| Layer | Path | Allowed to import |
|-------|------|-------------------|
| HTTP / controllers | `src/controllers/**`, `src/middlewares/**`, `src/auth/**` | `infrastructure/*` (DTOs, errors), `services/*` (business rules) — never SDK directly |
| Services | `src/services/**` | `infrastructure/*`, `repositories/*` (interfaces), `bootstrap/drive-registry` — never `fastify` |
| Repositories | `src/repositories/**` | `infrastructure/*` only — concrete implementations touch SDK via `infrastructure/sdk/index.ts` |
| Composition root | `src/bootstrap/**`, `src/index.ts` | All of the above |
| Config | `src/config/**` | `zod`, stdlib |
| Infrastructure | `src/infrastructure/**` | `hyper-sdk` only (and only `infrastructure/sdk/index.ts` actually imports it) |

## Configuration

| Env | Required | Default | Description |
|-----|----------|---------|-------------|
| `SIDECAR_TOKEN` | ✓ in production | dev placeholder in dev mode (logs a warning) | Static token used in `X-Sidecar-Token` header. Must be ≥16 chars in production. |
| `SIDECAR_PORT` | | `4321` | Listening port |
| `SIDECAR_HOST` | | `127.0.0.1` | Listening host (loopback only) |
| `SIDECAR_STORE_DIR` | | `./.sidecar-store` | Corestore persistence directory. The official SDK also drops a RocksDB-backed DNS cache at `${storeDir}/dnsCache`; we don't use DNS resolution but tolerate the extra directory. |
| `SIDECAR_SWARM_PORT` | | `0` (random UDP) | Hyperswarm UDP port; `0` lets the OS pick a free ephemeral port |
| `SIDECAR_BOOTSTRAP` | | — | Comma-separated bootstrap multiaddrs |
| `SIDECAR_LOG_LEVEL` | | `info` | pino log level |
| `SIDECAR_SHUTDOWN_TIMEOUT_MS` | | `30000` | Graceful shutdown deadline |

In development (`NODE_ENV !== 'production'`), if `SIDECAR_TOKEN` is unset the
sidecar falls back to a placeholder token and prints a warning. **Production
boot refuses the placeholder** and exits with a clear error.

## Routes (v1)

See `/docs` for the OpenAPI / Swagger UI (served from the sidecar itself).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/healthz` | no | Liveness probe |
| GET | `/docs` | no | Swagger UI |
| GET | `/v1/identity` | ✓ | Node identity (main drive key, peer count) |
| GET | `/v1/drives` | ✓ | List local drives |
| POST | `/v1/drives` | ✓ | Create drive |
| DELETE | `/v1/drives/:key` | ✓ | Delete drive |
| GET | `/v1/drives/:key/tree` | ✓ | List files |
| GET | `/v1/drives/:key/entry` | ✓ | Get entry metadata |
| GET | `/v1/drives/:key/file` | ✓ | Read file (stream) |
| PUT | `/v1/drives/:key/file` | ✓ | Write file (binary body) |
| DELETE | `/v1/drives/:key/file` | ✓ | Delete file / dir |
| POST | `/v1/swarm/announce` | ✓ | Announce main drive |
| GET | `/v1/swarm/peers` | ✓ | Connected peers |
| POST | `/v1/swarm/mount/:publicKey` | ✓ | Mount remote drive |
| POST | `/v1/swarm/unmount/:publicKey` | ✓ | Unmount remote drive |

All IDs are 64-char lowercase hex strings. All responses are `camelCase` JSON.
File IO uses query-string `?path=` with binary body.

## Development

```bash
pnpm install
SIDECAR_TOKEN=$(openssl rand -hex 32) pnpm --filter @cinereel/sidecar dev
```

```bash
curl -H "X-Sidecar-Token: $SIDECAR_TOKEN" http://127.0.0.1:4321/v1/identity
```

## Testing

```bash
pnpm --filter @cinereel/sidecar test
```

The smoke test starts an in-process server on a random port and hits 5 core
endpoints (`/healthz`, `/v1/identity`, `/v1/drives` + auth negative cases).

## Production build

```bash
pnpm --filter @cinereel/sidecar build && node --enable-source-maps dist/index.js
```

## C# callsite example

```csharp
var client = _http.CreateClient("sidecar");
client.DefaultRequestHeaders.Add(
    "X-Sidecar-Token",
    builder.Configuration["Sidecar:Token"]
);

var res = await client.GetAsync("http://127.0.0.1:4321/v1/identity");
var body = await res.Content.ReadFromJsonAsync<IdentityDto>();
```