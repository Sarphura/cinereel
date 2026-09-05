# @cinereel/hyper-client

Cinereel 的 `hyper-sdk`（Corestore / Hyperdrive / Hyperswarm）HTTP Adapter。
单个 Node + NestJS 进程，通过本地回环 HTTP Interface 供 C# 服务消费。

## 技术栈

- Node ≥ 20，TypeScript 严格模式
- NestJS 11、Express Adapter、`@nestjs/swagger` 11
- `zod` 请求与任务存储校验
- `hyper-sdk` 管理 Corestore / Hyperdrive / Hyperswarm

## 源码结构

Hyper Client 使用 Feature Service 直接调用共享 `hyper-sdk` 的结构：

```text
Controller -> DriveService / FileService / DownloadTaskService -> hyper-sdk SDK
```

| Module | 路径 | 职责 |
|--------|------|------|
| HTTP 入口 | `src/hyper.api/**` | Controller、DTO 与 OpenAPI 描述 |
| Feature Implementation | `src/hyper.implementation/**` | Drive 与 File 行为、DTO 转换和业务约束 |
| SDK 装配 | `src/hyper.infrastructure/sdk/**` | 创建并共享单例 SDK，在应用关闭时释放资源 |

`HyperSdkModule` 负责 SDK 的异步创建、依赖注入与生命周期，并共享 `DriveActivity` 使用登记。`DriveService` 与 `FileService` 注入同一个 SDK；`DownloadTaskService` 复用 `FileService` 的固定版本读取会话。SDK 在任务收尾后关闭。`src/app.module.ts` 是 composition root，`src/main.ts` 是进程入口。

## 配置

| 环境变量 | 必填 | 默认值 | 说明 |
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

## 检查

```bash
pnpm --filter @cinereel/hyper-client test
pnpm --filter @cinereel/hyper-client typecheck
pnpm --filter @cinereel/hyper-client build
```

## 生产构建

```bash
pnpm --filter @cinereel/hyper-client build
pnpm --filter @cinereel/hyper-client start
```

## 原文件读取、下载和播放

| 方法 | 地址 | 行为 |
|---|---|---|
| GET | `/v1/files/{driveKey}?path=...` | 返回原文件二进制流 |
| HEAD | 同上 | 返回元数据，不读取正文 |

`path` 使用规范 Drive 绝对路径。可选 `disposition=inline|attachment` 控制预览或下载，默认 `inline`；可选正整数 `driveVersion` 指定历史版本，省略时使用本次已取得的版本。响应包含 `Content-Type`、`Content-Length`、安全编码的 `Content-Disposition`、`Accept-Ranges: bytes`、`ETag` 和 `X-Drive-Version`。MIME 按扩展名推断，未知类型使用 `application/octet-stream`。

GET 支持 `bytes=start-end`、`bytes=start-` 和 `bytes=-suffix`，返回 `206`。不可满足的范围返回 `416` 与 `Content-Range: bytes */size`；非法格式、未知单位、多段 Range 忽略并返回完整 `200`。`If-Range` 仅在与当前 ETag 完全一致时采用 Range，否则返回完整内容。HEAD 忽略 Range。

```bash
curl -I --get "http://127.0.0.1:3000/v1/files/$DRIVE_KEY" --data-urlencode 'path=/movies/video.mp4'
curl --get "http://127.0.0.1:3000/v1/files/$DRIVE_KEY" --data-urlencode 'path=/movies/video.mp4' -H 'Range: bytes=0-1023' -o sample.bin
curl --get "http://127.0.0.1:3000/v1/files/$DRIVE_KEY" --data-urlencode 'path=/movies/video.mp4' --data-urlencode 'disposition=attachment' -o video.mp4
```

参数非法为 `400`，确认文件不存在为 `404`，目录或符号链接作为文件读取为 `409`，内容暂不可用为 `503`，等待超时为 `504`。默认元数据准备和缺块等待各为 30 秒，不限制整文件传输时长；首块错误仍可返回 JSON，正文开始后的错误会终止连接。客户端断连会取消本次读取，其他读取不受影响。

图片、PDF 和浏览器支持的音视频可使用原文件流。Range 支持 seek，但不改变媒体容器、编码或封装；MKV 等文件不会自动转码为浏览器支持的格式。C# 尚需实现流式代理，Web 尚需接入新契约。

## 离线下载任务

离线任务将数据块缓存到 `CONFIG_DIR` 的 Hyperdrive 存储，完成后通过同一文件 Interface 读取；不会导出到普通文件目录。

| 方法 | 地址 | 行为 |
|---|---|---|
| POST | `/v1/downloads` | 创建，持久化后返回 `202` |
| GET | `/v1/downloads?limit=100&cursor=...` | 分页列表，最大 500 条 |
| GET | `/v1/downloads/{taskId}` | 状态、进度与错误 |
| POST | `/v1/downloads/{taskId}/pause` | 暂停 |
| POST | `/v1/downloads/{taskId}/resume` | 继续暂停的任务 |
| POST | `/v1/downloads/{taskId}/cancel` | 取消 |
| POST | `/v1/downloads/{taskId}/retry` | 重试失败的任务 |

创建正文包含 `driveKey`、`path`、`targetType`（`file` 或 `directory`），可选 `driveVersion`。整盘使用 `targetType=directory` 与 `path=/`，缓存全部普通文件，排除 `/.cinereel` 协议目录。协议文件通过独立 Interface 访问；直接以协议路径创建任务会在执行时失败，错误码为 `reserved-path`。要求 `Idempotency-Key`；相同键和规范化参数返回同一任务，冲突返回 `409`。

```http
POST /v1/downloads
Content-Type: application/json
Idempotency-Key: offline-movies-001

{"driveKey":"<64 位十六进制 key>","path":"/movies","targetType":"directory"}
```

任务状态为 `queued`、`running`、`paused`、`completed`、`failed`、`canceled`。默认最多同时运行两个任务，每任务顺序处理文件。首次成功读取元数据后固定版本，并在处理内容前固定已经确认的正文 fork；暂停、继续、重试和重启均不切换到最新版本，元数据或正文被截断会导致原任务失败。目录不跟随符号链接，跳过数量为 `skippedEntries`；单文件目标为符号链接时失败。

`processedBytes` 表示已确认文件字节和当前文件处理字节之和，包含本地缓存读取，不是网络流量；统计完成前总量为 `null`。恢复会重新验证缓存，从未完成文件开始读取，瞬时进度可能回退。临时网络错误最多自动重试三次，间隔 1、5、30 秒，等待期间释放执行名额；失败后可手动重试。

任务记录保存在 `CONFIG_DIR/download-tasks.json`，采用校验、串行写入和原子替换。重启自动继续排队和中断的运行任务，暂停任务保持暂停；损坏或不支持的存储格式会使任务模块启动失败，并保留原文件。

暂停和取消均保留已缓存数据。`completed` 表示对应版本完成过缓存，显式清理 Drive 后缓存可能失效。活跃文件操作，以及排队、运行、暂停的任务，会使 Drive 卸载、删除或清理测试返回 `409`；须先结束操作并取消未完成任务。没有自动缓存淘汰、空间配额或可靠回收保证。

架构依据见 [ADR-0010](../../docs/adr/0010-stream-files-and-persist-offline-download-tasks.md)。
