# Hyper SDK 设计

## 1. 架构设计

### 1.1 定位与目标

Sidecar 通过官方 `hyper-sdk@^6.2.2`（[RangerMauve/hyper-sdk](https://github.com/RangerMauve/hyper-sdk)）
访问 Hyper 分布式存储系统。Sidecar 不维护自建 SDK，而是在官方 SDK
之上**叠加一个面向 HTTP 的薄服务层**，并按 CSR 五层严格分离
（`controllers/` → `services/` → `repositories/` + `infrastructure/` + `middlewares/` + `bootstrap/`）。

- **负责**：把官方 SDK 的 `Hyperdrive` 实例按 `driveKey`（hex）寻址，
  把 Hyperdrive 文件操作包装成 `FileService`，把 Hyperswarm 连接状态
  包装成 `SwarmService`；管理业务元数据（drive 名称 / 类型 / 创建时间）
  和 UUID 命名空间恢复
- **不负责**：HTTP 路由 / 认证 / 请求校验（由 `controllers/` + `middlewares/` 层负责）

### 1.2 分层

```
┌────────────────────────────────────────────────────────────────┐
│  controllers 层  (apps/sidecar/src/controllers/**)              │
│   - <resource>.controller.ts  — 每个资源一个 class             │
│   - schemas.ts                — JSON Schema (draft-07)         │
│   看不到 Hyperdrive 实例，只看得到 FileService / SwarmService  │
└──────────────────────────┬─────────────────────────────────────┘
                           │  consumes
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  services 层  (apps/sidecar/src/services/**)                    │
│   - drives.service.ts          — class DriveService            │
│   - files.service.ts           — class FileService             │
│   - swarm.service.ts           — class SwarmService             │
│   不接触 fastify / SDK 调用                                    │
└──────────────────────────┬─────────────────────────────────────┘
                           │  uses interfaces
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  repositories 层  (apps/sidecar/src/repositories/**)           │
│   - drive.repository.ts        — DriveRepository               │
│   - drive-index.repository.ts  — DriveIndexRepository           │
│   - peer-connection.repository.ts — PeerConnectionRepository    │
│   - in-memory/                 — 测试用 fake 实现              │
└──────────────────────────┬─────────────────────────────────────┘
                           │  imports
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  infrastructure 层  (apps/sidecar/src/infrastructure/**)       │
│   - sdk/index.ts               — 唯一的 import 'hyper-sdk' 入口│
│   - types/{dto,hyperdrive,key} — wire DTOs + HyperdriveLike    │
│   - errors/index.ts            — SidecarError + 错误码         │
└──────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
                  hyper-sdk@^6.2.2
                  (npm, 来自 RangerMauve/hyper-sdk)
```

还有：
- `bootstrap/`（composition root + shared in-memory state `DriveRegistry`）
- `middlewares/`（Fastify `preHandler` / `setErrorHandler`）
- `auth/`（JWT + API key 加密原语）

### 1.3 各层职责

| 层 | 文件 | 职责 | 不允许 |
| --- | --- | --- | --- |
| `infrastructure/` | `sdk/index.ts` | 唯一 `import 'hyper-sdk'` | 业务逻辑、fastify |
| `infrastructure/` | `types/{dto,hyperdrive,key}.ts` | wire 格式 + 结构类型 + 编解码 | 任何实现细节 |
| `infrastructure/` | `errors/index.ts` | 跨层错误原语 (`SidecarError`) | 业务规则 |
| `repositories/` | `drive.repository.ts` | Hyperdrive 数据访问（open / close） | fastify、业务规则 |
| `repositories/` | `drive-index.repository.ts` | 业务元数据持久化（JSON 文件） | fastify、SDK 直接调用 |
| `repositories/` | `peer-connection.repository.ts` | swarm 连接数据访问 | fastify、业务规则 |
| `services/` | `drives.service.ts` | drive CRUD 业务规则 | fastify、SDK |
| `services/` | `files.service.ts` | 文件操作业务规则（isRemote 拒绝） | fastify、SDK |
| `services/` | `swarm.service.ts` | 网络 / swarm 业务规则 | fastify、SDK |
| `bootstrap/` | `bootstrap.ts` | 一站式 composition root | fastify 业务路由 |
| `bootstrap/` | `drive-registry.ts` | 共享 in-memory 状态（DriveRegistry） | SDK、HTTP |
| `controllers/` | `<resource>.controller.ts` | HTTP 适配器，class + `register(app)` | 业务规则、SDK |
| `controllers/` | `schemas.ts` | JSON Schema 校验 | 任何实现细节 |
| `middlewares/` | `server.ts` | Fastify 装配 + CORS + Swagger | 业务规则 |
| `middlewares/` | `auth.middleware.ts` | 认证 preHandler | 业务规则、SDK |
| `middlewares/` | `error.middleware.ts` | SidecarError → wire body | 业务规则 |
| `auth/` | `jwt.ts` `keys.ts` | JWT 签验 + API key 注册 | 业务规则、SDK |
| `config/` | `schema.ts` `load.ts` | zod 配置 + env loader | 任何业务逻辑 |

### 1.4 边界守护

`scripts/check-sdk-boundary.sh` 在 CI 中运行，强制：

- `src/` 下只有 `infrastructure/sdk/index.ts` 能 `import 'hyper-sdk'`（重导出）
- 任何其它文件直接导入 `hyper-sdk` 都会被拒绝
- 任何文件直接导入 `hypercore*` / `hyperdrive*` / `hyperswarm*` / `corestore*` 都会被拒绝

这条规则让 "services 不知道 `Hyperdrive` 类的存在" 这条架构约束有了**机械性**保证，而不是靠 code review。

## 2. 关键决策

### 2.1 为什么走「CSR」而不是「旧三层」

旧的方案是 `core/ + domain/ + http/`。`core/` 既是 SDK 适配器又定义服务接口；
`domain/` 用工厂函数（`makeDriveService()`）返回对象字面量，难注入、难单测。

新的 CSR：

- `repositories/` 抽 `interface` + 默认 class + in-memory fake。Services 依赖
  interface，单元测试用 fake 直接注入。
- `services/` 改成 `class`，constructor 注入依赖。`this.keyToUuid` 这类内部状态
  用 `private` 字段，告别 closure 黑魔法。
- `controllers/` 改成 `class` + `register(app)` 方法，`registerControllers(app, deps)`
  在一个地方集中装配所有 controller。
- `bootstrap/` 拥有 `InMemoryDriveRegistry`——这是 composition 层独有的 in-process
  状态，不属于数据访问层。

### 2.2 UUID-as-namespace

每个本地 drive 在 `repositories/drive-index.repository.ts` 的 JSON 文件里有一行：

```json
{ "<uuid>": { "name": "movies", "type": "blob", "createdAt": "..." } }
```

UUID 就是官方 SDK 的 namespace。`sdk.getDrive(uuid)` 每次返回同一个 Corestore 子命名空间，所以**重启后 drive 内容不丢，driveKey 不变**。

主 drive 用固定字符串 `"main"` 作为 namespace，便于在所有 sidecar 实例之间共享（"main drive" = 这个 sidecar 自己的索引盘）。

### 2.3 `sdk.connections` vs `sdk.peers`

官方 SDK 提供两个 swarm 状态视图：

- `sdk.peers` — `PeerInfo[]`，由 SDK 包装过的元数据列表
- `sdk.connections` — `Set<Connection>`，Hyperswarm 原始连接

我们读 `sdk.connections`（而不是 `sdk.peers`）作为 `PeerConnectionRepository.list()` 的数据源，原因：

- 测试时要把合成 connection 直接 push 进 `connections`，`peers` 是 SDK 内部派生的、不会反映手动注入
- `connections` 上的 `remotePublicKey` 是权威源头（与真实 hyperswarm 行为一致）

注意：官方 SDK 的 TS 类型声明 `sdk.connections: Connection[]`，但运行时是 `Set<Connection>`。`HyperdriveSwarmRepository` 用 `.size` 取大小（`.length` 是 `undefined`）。

### 2.4 远端 mount 用 `HyperdriveLike` 而不是 `Hyperdrive`

官方 SDK 没有重新导出 `Hyperdrive` 类，`hyperdrive` 也不是 sidecar 的直接依赖。
为了在 `services/files.service.ts` 里写 `drive.entry(...)` 而不引入新依赖，
我们定义了一个**结构类型** `HyperdriveLike`（在
`infrastructure/types/hyperdrive.ts`），只列出 services 实际调用的方法。

这样：

- `hyper-sdk` 是 sidecar 唯一的 hyper 依赖
- `HyperdriveLike` 是编译期接口，运行时就是真实 `Hyperdrive` 实例
- 如果以后需要新方法，编辑 `hyperdrive.ts` 和 `repositories/drive.repository.ts` 同时加上即可

## 3. 关键路径

### 3.1 启动：`pnpm dev`

```text
src/index.ts                          ← top-level entry
  └─ loadConfig()                     ← config/load.ts (env)
  └─ loadApiKeys()                    ← auth/keys.ts
  └─ bootstrap(config)                ← bootstrap/bootstrap.ts
       ├─ createSdk(...)              ← infrastructure/sdk/index.ts
       ├─ new FileSystemDriveIndexRepository(config.storeDir)
       ├─ new HyperdriveRepository(sdk)
       ├─ new HyperdriveSwarmRepository(sdk.connections)
       ├─ new InMemoryDriveRegistry()
       ├─ drivesRepo.openLocal('main') + registry.rememberLocal
       ├─ for each uuid in index: drivesRepo.openLocal(uuid)
       ├─ new DriveService(...) + seed(keyToUuid)
       ├─ new FileService(registry)
       └─ new SwarmService(...)
  └─ buildServer(config, services, sdk) ← middlewares/server.ts
       ├─ registerControllers()        ← controllers/index.ts
       ├─ registerAuthMiddleware()     ← middlewares/register-auth.ts
       └─ registerErrorHandler()       ← middlewares/error.middleware.ts
  └─ app.listen({ host, port })
```

### 3.2 文件写：`PUT /v1/drives/:key/file`

```text
PUT /v1/drives/:key/file
  → auth preHandler                                   ← middlewares/auth.middleware.ts
  → controller (controllers/drives.controller.ts)      → files.write(key, path, buf, meta)
  → services/files.service.ts.write()
       ├─ get(key) → registry.byKey(key)               ← bootstrap/drive-registry.ts
       ├─ if registry.isRemote(key) → throw "cannot write to remote"
       ├─ drive.createWriteStream(path) → end(buf)
       └─ return { ok: true, byteLength }
  → response: 200 { ok, byteLength }
```

### 3.3 远端 mount：`POST /v1/swarm/mount/:publicKey`

```text
POST /v1/swarm/mount/<hex>
  → auth preHandler
  → controller (controllers/swarm.controller.ts)       → swarm.mount(publicKey)
  → services/swarm.service.ts.mount()
       ├─ HEX64 校验
       ├─ drives.openRemote(publicKey)                 ← repositories/drive.repository.ts
       ├─ registry.rememberRemote(driveKey, drive)     ← bootstrap/drive-registry.ts
       └─ return { driveKey }
  → response: 200 { driveKey }
```

## 4. 约束与限制

- **写入只能 local**：远端 mount 是只读的（write 拒绝，delete 拒绝）。
  理由：Hyperswarm 的 CRDT 语义下，写远端 drive 会绕过对方的发现流程，
  造成数据分裂。
- **`main` drive 不能 remove**：作为元数据索引盘，被 `index.json` 和
  `swarm.identity()` 共同依赖。`FileSystemDriveIndexRepository.remove` 和
  `DriveService.remove` 各拒一次，两层防御。
- **driveKey 永远是 64-char lowercase hex**：跨 wire / on-disk / in-memory 一律用这个格式，
  避免大小写或 base32 混淆。`infrastructure/types/key.ts::isHex64` 是唯一的格式校验。
- **swarm port 0 表示未监听**：hyperswarm 还没绑定 UDP 时，`identity.swarmPort = 0`。
  测试场景下（`autoJoin: false`）这很常见。

## 5. 进一步阅读

- `docs/hyper-sdk-capability-map.md` — drive 能力 → 文件 / 函数映射表
- `docs/hyper-sdk-acl.md` — 现存边界守护（`check-sdk-boundary.sh`）
- `apps/sidecar/README.md` — sidecar 本地使用文档