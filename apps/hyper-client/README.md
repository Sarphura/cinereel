# @cinereel/hyper-client

`hyper-sdk` (Corestore / Hyperdrive / Hyperswarm) REST hyper client for Cinereel.
A single Node + NestJS process that exposes hyper SDK operations over a
loopback HTTP API. **Only** consumed by `@cinereel/service` (C# / ASP.NET Core).

## Stack

- Node ≥ 20, TypeScript strict mode
- NestJS 11 + Express adapter + `@nestjs/swagger` 11
- `zod` for env-var config parsing
- The official `hyper-sdk@^6.2.2` npm package wraps Corestore / Hyperdrive / Hyperswarm

## 源码结构

Hyper Client 使用 Feature Service 直接调用共享 `hyper-sdk` 的结构：

```text
Controller -> DriveService / FileService -> hyper-sdk SDK
```

| Module | 路径 | 职责 |
|--------|------|------|
| HTTP 入口 | `src/hyper.api/**` | Controller、DTO 与 OpenAPI 描述 |
| Feature Implementation | `src/hyper.implementation/**` | Drive 与 File 行为、DTO 转换和业务约束 |
| SDK 装配 | `src/hyper.infrastructure/sdk/**` | 创建并共享单例 SDK，在应用关闭时释放资源 |

`HyperSdkModule` 只负责 SDK 的异步创建、依赖注入和生命周期，不包装或转发 SDK 方法。`DriveService` 与 `FileService` 注入同一个 SDK 实例，并分别保持各自行为的 Locality。`src/app.module.ts` 是 composition root，`src/main.ts` 是进程入口。

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
