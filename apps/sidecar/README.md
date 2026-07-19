# @cinereel/sidecar

Hyper SDK (Corestore / Hyperdrive / Hyperswarm) REST sidecar for CineReel.
A single Node + Fastify 5 process that exposes hyper SDK operations over a
loopback HTTP API. **Only** consumed by `@cinereel/service` (C# / ASP.NET Core).

## Stack

- Node ≥ 20, TypeScript strict mode
- Fastify 5 (latest) + `@fastify/cors` 11 + `@fastify/swagger` 9 + `@fastify/swagger-ui` 6
- Raw JSON Schema (draft-07) for request/response validation — **not** `fastify-type-provider-zod`. Fastify 5.10 strict mode rejects zod-translated schemas that omit the `required` array; raw JSON schema sidesteps the issue and stays explicit.
- `zod` is used only for env-var config parsing in `src/config.ts`.

## Boundaries

The hyper SDK (Corestore / Hyperdrive / Hyperswarm) is **not** a direct
dependency of this package — it is consumed through `@cinereel/hyper-sdk`
(the workspace package at `packages/hyper-sdk/`). The boundary is enforced
by `scripts/check-sdk-boundary.sh` (`pnpm --filter @cinereel/sidecar
check:sdk-boundary`); direct `hypercore*` / `hyperdrive*` / `hyperswarm*` /
`corestore*` imports anywhere under `apps/sidecar/src/**` or
`apps/sidecar/test/**` cause the check to fail.

| Layer | Path | Allowed to import |
|-------|------|-------------------|
| HTTP / auth | `src/{http,auth}/**` | `@cinereel/hyper-sdk` only |
| Composition root | `src/index.ts`, `src/server.ts` | `@cinereel/hyper-sdk` only |
| Config | `src/config.ts` | `zod`, stdlib |

## Future: another hyper SDK consumer

When a second consumer appears (Electron, CLI, Go/Rust bridge), it should
import via `@cinereel/hyper-sdk` — never the raw SDK packages. See
`packages/hyper-sdk/README.md` for the SDK surface.

## Configuration

| Env | Required | Default | Description |
|-----|----------|---------|-------------|
| `SIDECAR_TOKEN` | ✓ in production | dev placeholder in dev mode (logs a warning) | Static token used in `X-Sidecar-Token` header. Must be ≥16 chars in production. |
| `SIDECAR_PORT` | | `4321` | Listening port |
| `SIDECAR_HOST` | | `127.0.0.1` | Listening host (loopback only) |
| `SIDECAR_STORE_DIR` | | `./.sidecar-store` | Corestore persistence directory |
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

