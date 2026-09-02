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

## 配置

| Env | Required | Default | Description |
|-----|----------|---------|-------------|
| `HOST` | | `127.0.0.1` | HTTP 监听地址 |
| `PORT` | | `3000` | HTTP 监听端口 |
| `CONFIG_DIR` | | `./.cinereel` | Corestore、Hyperdrive 和 Drive key 的持久化目录 |
| `NODE_ENV` | | `development` | 设为 `production` 时不启用 Swagger UI |

## 开发

```bash
pnpm install
pnpm --filter @cinereel/hyper-client dev
```

```bash
curl http://127.0.0.1:3000/healthz
```

### Worktree 与本地存储

Hyper Client 默认使用进程当前目录下的 `.cinereel`。不同 Git worktree 因此会拥有不同的 Corestore 和 Drive 写入密钥。如果请求发送给了另一个 worktree 的 Hyper Client，该进程只能按 public key 打开 Drive，`addFile` 会返回 `403 Forbidden`。

排查时先用 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 找到监听进程，再用 `lsof -a -p <PID> -d cwd` 确认它所属的 checkout，并通过 `GET /v1/drives` 确认目标 Drive key 已由当前实例恢复。需要使用指定存储时，应停止错误实例后从正确 checkout 启动，或显式设置绝对路径 `CONFIG_DIR`。同一 `CONFIG_DIR` 同时只能由一个 Hyper Client 进程打开，否则会出现 `File descriptor could not be locked`。

## Testing

```bash
pnpm --filter @cinereel/hyper-client test
```

## Production build

```bash
pnpm --filter @cinereel/hyper-client build && node --enable-source-maps dist/main.js
```
