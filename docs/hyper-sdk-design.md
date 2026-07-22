# Hyper SDK 设计

## 1. 架构设计

### 1.1 定位与目标

Sidecar 通过官方 `hyper-sdk@^6.2.2`（[RangerMauve/hyper-sdk](https://github.com/RangerMauve/hyper-sdk)）
访问 Hyper 分布式存储系统。Sidecar 不维护自建 SDK，而是在官方 SDK
之上**叠加一个面向 HTTP 的薄 NestJS 服务层**，并按 NestJS 模块化结构分离：

```
apps/sidecar/src/
├─ core/                       # 跨模块基础设施（config / logger / sdk / swagger / filter）
├─ bootstrap/                  # @Global composition root（InMemoryDriveRegistry + OnModuleInit）
├─ repositories/               # 数据访问（hyper-sdk 适配 + in-memory fake）
├─ services/                   # 业务规则
├─ feature-<name>/             # NestJS feature 模块：controllers + DTOs
├─ infrastructure/             # SDK 边界、wire DTOs、HyperdriveLike 结构类型、错误
├─ auth/                       # JWT + API key 加密原语
├─ app.module.ts               # 根模块
└─ main.ts                     # NestFactory.create + listen
```

- **负责**：把官方 SDK 的 `Hyperdrive` 实例按 `driveKey`（hex）寻址，
  把 Hyperdrive 文件操作包装成 `FileService`，把 Hyperswarm 连接状态
  包装成 `SwarmService`；管理业务元数据（drive 名称 / 类型 / 创建时间）
  和 UUID 命名空间恢复
- **不负责**：HTTP 路由 / 认证 / 请求校验（由 `feature-*/controllers` + `core/middleware` 负责）

### 1.2 分层

```
┌────────────────────────────────────────────────────────────────┐
│  feature-* 层  (apps/sidecar/src/feature-*/**)
│     - <name>.controller.ts     — NestJS @Controller class
│     - dto/                      — Zod schemas wrapped via createZodDto
│     - <name>.module.ts          — @Module({ controllers, imports })
│     看不到 Hyperdrive 实例，只看得到 FileService / SwarmService
└──────────────────────────┬─────────────────────────────────────┘
                           │  consumes services
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  services 层  (apps/sidecar/src/services/**)
│     - drives.service.ts         — @Injectable class DriveService
│     - files.service.ts          — @Injectable class FileService
│     - swarm.service.ts          — @Injectable class SwarmService
│     接触 SDK（透过 @Inject(SDK_TOKEN)），不接触 framework
└──────────────────────────┬─────────────────────────────────────┘
                           │  uses interfaces / @Inject tokens
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  repositories 层  (apps/sidecar/src/repositories/**)
│     - drive.repository.ts       — HyperdriveRepository (concrete class)
│     - drive-index.repository.ts — FileSystemDriveIndexRepository
│     - peer-connection.repository.ts — HyperdriveSwarmRepository
└──────────────────────────┬─────────────────────────────────────┘
                           │  imports via SDK
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  infrastructure 层  (apps/sidecar/src/infrastructure/**)
│     - sdk/index.ts              — 唯一的 import 'hyper-sdk' 入口
│     - types/{dto,hyperdrive,key} — wire DTOs + HyperdriveLike
│     - errors/index.ts           — SidecarError + 错误码
└──────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
                  hyper-sdk@^6.2.2
                  (npm, 来自 RangerMauve/hyper-sdk)
```

还有：
- `bootstrap/bootstrap.module.ts`（@Global composition root，持有 `InMemoryDriveRegistry`，
  并通过 `BootstrapService.onModuleInit` 复刻旧 `bootstrap.ts` 的副作用序列：
  `load index → mount main → remount persisted → seed keyToUuid → initial announce`）
- `core/middleware/auth.middleware.ts`（替代 Fastify `preHandler`，由 `AuthModule` 的
  `MiddlewareConsumer` 仅对 `/v1/swarm*`、`/v1/drives*`、`/v1/identity` 装配）
- `core/common/filters/http-exception.filter.ts`（替代 Fastify `setErrorHandler`，
  把 `SidecarError` / `ZodValidationException` / `HttpException` 翻译成 wire body）
- `core/common/middleware/raw-body.middleware.ts`（`express.raw({ type: 'application/octet-stream' })`，
 配合 `@RawBody()` 装饰器读回 Buffer）
- `auth/`（HS256 JWT + API key 注册，控制器用 `HttpException` 抛错误而不是裸 Error）
- `core/config/env.schema.ts`（Zod 配置 + `validateOrThrow`，`@nestjs/config` 的入口）
- `core/sdk/sdk.module.ts`（`CoreSdkModule.forRootAsync()` 异步初始化 SDK 并提供 `SDK_TOKEN`）

### 1.3 各层职责

| 层 | 文件 | 职责 | 不允许 |
| --- | --- | --- | --- |
| `infrastructure/` | `sdk/index.ts` | 唯一 `import 'hyper-sdk'` | 业务逻辑、framework |
| `infrastructure/` | `types/{dto,hyperdrive,key}.ts` | wire 格式 + 结构类型 + 编解码 | 任何实现细节 |
| `infrastructure/` | `errors/index.ts` | 跨层错误原语 (`SidecarError`) | 业务规则 |
| `repositories/` | `drive.repository.ts` | Hyperdrive 数据访问（open / close） | framework、业务规则 |
| `repositories/` | `drive-index.repository.ts` | 业务元数据持久化（JSON 文件） | framework、SDK 直接调用 |
| `repositories/` | `peer-connection.repository.ts` | swarm 连接数据访问 | framework、业务规则 |
| `services/` | `drives.service.ts` | drive CRUD 业务规则 | framework、SDK 裸调用 |
| `services/` | `files.service.ts` | 文件操作业务规则（isRemote 拒绝） | framework、SDK 裸调用 |
| `services/` | `swarm.service.ts` | 网络 / swarm 业务规则 | framework、SDK 裸调用 |
| `bootstrap/` | `bootstrap.module.ts` | `@Global` 组合根 + OnModuleInit 副作用 | framework 业务路由 |
| `bootstrap/` | `drive-registry.ts` | 共享 in-memory 状态（DriveRegistry） | SDK、HTTP |
| `feature-*/controllers` | `<name>.controller.ts` | HTTP 适配器（NestJS `@Controller`） | 业务规则、SDK |
| `feature-*/dto` | `index.ts` | Zod schemas → `createZodDto` DTO class | 任何实现细节 |
| `core/middleware/` | `auth.middleware.ts` | 认证 middleware | 业务规则、SDK |
| `core/common/filters/` | `http-exception.filter.ts` | `SidecarError` → wire body | 业务规则 |
| `core/common/middleware/` | `raw-body.middleware.ts` | `express.raw()` 包装 octet-stream | 业务规则 |
| `auth/` | `jwt.ts` `keys.ts` | JWT 签验 + API key 注册 | 业务规则、SDK |
| `core/config/` | `env.schema.ts` | Zod 配置 + env loader | 任何业务逻辑 |
| `core/sdk/` | `sdk.module.ts` | `CoreSdkModule.forRootAsync()` SDK 初始化 | 业务规则 |

### 1.4 边界守护

旧 `scripts/check-sdk-boundary.sh` 已经被替换为 ESLint `no-restricted-imports` 规则，
配置在 `apps/sidecar/.eslintrc.cjs`。规则约束：

- `src/` 下只有 `infrastructure/sdk/index.ts` 能 `import 'hyper-sdk'`
- 任何其它文件直接导入 `hyper-sdk` / `hypercore*` / `hyperdrive*` / `hyperswarm*` /
  `corestore*` 都会被 ESLint 拒绝

CI 上 `pnpm lint` 即可机械执行这条规则。

## 2. 关键决策

### 2.1 为什么走 NestJS 而不是裸 Fastify

旧 CSR 已经把所有职责拆干净（controllers / services / repositories / infrastructure），
但要做 wire-兼容性的回归测试时，每次都得自己起 HTTP server、自己注入 mock、逐条校验
response body。NestJS 提供了：

- **IoC 容器**：`bootstrap.module.ts` 用 `@Global()` 加 `@Module()` 替掉了手写
  `makeServices()` 工厂函数。`@Inject(SDK_TOKEN)` 替掉了裸构造器 `new Service(sdk)`
  所带来的 hidden global 状态。
- **声明式 middleware**：`AuthModule implements NestModule.configure(consumer)` 替掉了
  Fastify 的 `app.addHook('preHandler', ...)` 注册陷阱。
- **生命周期**：用 `BootstrapService.onModuleInit` 把"load index → mount → seed keyToUuid
  → announce"这套副作用排版到一个方法里，比 `await bootstrap(config)` 的命令式顺序更易
  调试（`OnModuleDestroy` 由 `SdkLifecycle` 提供，对应 graceful shutdown 的
  `sdk.close()`）。
- **`@nestjs/testing`**：单元测试直接 `Test.createTestingModule().overrideProvider
  (SDK_TOKEN).useValue(stub)`，完全不需要手起 server。
- **`@StreamableFile`**：取代裸 `reply.send(stream)`，正确处理 `Content-Type` /
  `Content-Disposition` / HTTP 304 / HEAD 这些 streaming 特有的边缘场景。

代价是引入了 `reflect-metadata` + decorator 编译要求，但这是 HTTP server 框架的常规代价。

### 2.2 为什么用 Zod 而不是 JSON Schema

- **单一来源**：DTO class (`@ApiProperty` + Zod schema) 同时供 Swagger OpenAPI metadata、
  runtime validation、`ZodValidationPipe` 使用，没有"两份 schema 漂移"的风险。
- **类型安全**：DTO class 的 TypeScript 类型由 `z.infer<typeof schema>` 直接派生。
- **`nestjs-zod`**：在 OpenAPI 输出里把 Zod schema 翻译成 JSON Schema。这样 wire 上仍是
  合法 JSON Schema 给 C# 业务端消费，验证逻辑则是 Zod。

DTO 形态：

```ts
export const Hex64Schema = z.string().regex(/^[0-9a-f]{64}$/)
export const DriveDescriptorSchema = z.object({
  uuid: z.string().uuid(),
  name: z.string().min(1).max(64),
  type: z.enum(['metadata', 'blob']),
  driveKey: Hex64Schema,
  isLocal: z.boolean(),
  createdAt: z.string().datetime(),
})
export class DriveDescriptorDto extends createZodDto(DriveDescriptorSchema) {}
```

NestJS + Express + nestjs-zod 的 OpenAPI 输出对 9 个路由是稳定的（见
`apps/sidecar/test/openapi.snapshot.json`）。

### 2.3 UUID-as-namespace

每个本地 drive 在 `repositories/drive-index.repository.ts` 的 JSON 文件里有一行：

```json
{ "<uuid>": { "name": "movies", "type": "blob", "createdAt": "..." } }
```

UUID 就是官方 SDK 的 namespace。`sdk.getDrive(uuid)` 每次返回同一个 Corestore 子命名空间，
所以**重启后 drive 内容不丢，driveKey 不变**。

主 drive 用固定字符串 `"main"` 作为 namespace，便于在所有 sidecar 实例之间共享
（"main drive" = 这个 sidecar 自己的索引盘）。

`BootstrapService.onModuleInit` 在 Nest 启动时复刻旧 `bootstrap.ts` 的副作用序列：

1. `await this.index.load()`
2. `await this.drives.openLocal('main') + registry.rememberLocal('main')`
3. for-each persisted uuid: `openLocal + rememberLocal + keyToUuid.set`
4. `this.driveService.seed(keyToUuid)`
5. `await this.swarmService.announce(true)` (best-effort)

### 2.4 `sdk.connections` vs `sdk.peers`

官方 SDK 提供两个 swarm 状态视图：

- `sdk.peers` — `PeerInfo[]`，由 SDK 包装过的元数据列表
- `sdk.connections` — `Set<Connection>`，Hyperswarm 原始连接

我们读 `sdk.connections`（而不是 `sdk.peers`）作为 `PeerConnectionRepository.list()` 的
数据源，原因：

- 测试时要把合成 connection 直接 push 进 `connections`，`peers` 是 SDK 内部派生的、
  不会反映手动注入
- `connections` 上的 `remotePublicKey` 是权威源头（与真实 hyperswarm 行为一致）

注意：官方 SDK 的 TS 类型声明 `sdk.connections: Connection[]`，但运行时是 `Set<Connection>`。
`HyperdriveSwarmRepository` 用 `.size` 取大小（`.length` 是 `undefined`）。

### 2.5 远端 mount 用 `HyperdriveLike` 而不是 `Hyperdrive`

官方 SDK 没有重新导出 `Hyperdrive` 类，`hyperdrive` 也不是 sidecar 的直接依赖。
为了在 `services/files.service.ts` 里写 `drive.entry(...)` 而不引入新依赖，我们定义了
一个**结构类型** `HyperdriveLike`（在 `infrastructure/types/hyperdrive.ts`），只列出
services 实际调用的方法。

这样：

- `hyper-sdk` 是 sidecar 唯一的 hyper 依赖
- `HyperdriveLike` 是编译期接口，运行时就是真实 `Hyperdrive` 实例
- 如果以后需要新方法，编辑 `hyperdrive.ts` 和 `repositories/drive.repository.ts` 同时
  加上即可

### 2.6 Express vs Fastify

NestJS 默认的 HTTP 适配器是 Express，但项目选用 **Express 4.21.2** 做底层：

- `express.raw({ type: 'application/octet-stream' })` 用法稳定，NestJS 的
  `MiddlewareConsumer` 不需要重新写 Fastify streaming 入站 hook。
- `@StreamableFile` 透明地用 Express 的 `pipe(res)`，不需要在 controller 里手动
  `reply.send(stream)`。
- CORS 用 `app.enableCors()` 一行解决。

## 3. 关键路径

### 3.1 启动：`pnpm dev`

```text
src/main.ts                              ← top-level entry
  ├─ loadConfig()                        ← core/config/env.schema.ts (Zod)
  ├─ loadApiKeys()                       ← auth/keys.ts
  ├─ NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })
  │       ├─ CoreConfigModule            ← @nestjs/config + Zod validate hook
  │       ├─ CoreLoggerModule            ← nestjs-pino
  │       ├─ CoreSdkModule.forRootAsync() ← core/sdk/sdk.module.ts
  │       ├─ BootstrapModule (@Global)    ← bootstrap/bootstrap.module.ts
  │       │     └─ BootstrapService.onModuleInit
  │       │           ├─ index.load
  │       │           ├─ drives.openLocal('main') + rememberLocal
  │       │           ├─ for uuid in index: openLocal + rememberLocal + keyToUuid.set
  │       │           ├─ driveService.seed(keyToUuid)
  │       │           └─ swarm.announce(true) (best-effort)
  │       ├─ HealthModule                ← feature-health/*
  │       ├─ AuthModule                  ← feature-auth/* (also configures AuthMiddleware)
  │       ├─ DrivesModule                ← feature-drives/* (CRUD + file ops + test)
  │       └─ SwarmModule                 ← feature-swarm/* (swarm + identity)
  ├─ app.enableCors({...})
  ├─ app.use(express.json({ limit: '1mb' }))
  ├─ app.use('/v1/drives', express.raw({ type: 'application/octet-stream' }), rawBodySaver)
  ├─ app.useGlobalFilters(new HttpExceptionFilter())
  ├─ ensureSwaggerPatch() + SwaggerModule.setup('docs', app, buildOpenAPI(app))   ← dev only
  ├─ app.listen(port, host)
  └─ SIGINT/SIGTERM → SdkLifecycle.onModuleDestroy → sdk.close()
```

### 3.2 文件写：`PUT /v1/drives/:key/file`

```text
PUT /v1/drives/:key/file
  → AuthMiddleware.use()                                 ← core/middleware/auth.middleware.ts
       ├─ Bearer JWT verified → req.apiKeyId set
       └─ next()
  → express.raw middleware                               ← PUT octet-stream body
       └─ (req as any)[RAW_BODY_KEY] = req.body
  → DrivesController.writeFile(@Param('key'),
                              @Query(FileWriteQueryDto),
                              @RawBody() body: Buffer,
                              @Headers('x-metadata') metaHdr?)
       → files.write(key, q.path, body, metadata)
            ├─ get(key) → registry.byKey(key)            ← bootstrap/drive-registry.ts
            ├─ if registry.isRemote(key) → throw SidecarError(409, 'WRITE_REJECTED')
            ├─ drive.createWriteStream(path) → end(buf)
            └─ return { ok: true, byteLength }
  → response: 200 { ok, byteLength }
```

### 3.3 远端 mount：`POST /v1/swarm/mount/:publicKey`

```text
POST /v1/swarm/mount/<hex>
  → AuthMiddleware.use()                                 ← Bearer JWT or X-Sidecar-Token
  → SwarmController.mount(@Param(new ZodValidationPipe(Hex64ParamSchema)))
       → swarm.mount(publicKey)
            ├─ HEX64 校验                                ← infrastructure/types/key.ts
            ├─ drives.openRemote(publicKey)              ← repositories/drive.repository.ts
            ├─ registry.rememberRemote(driveKey, drive) ← bootstrap/drive-registry.ts
            └─ return { driveKey }
  → response: 200 { driveKey }
```

### 3.4 三种开发模式

`pnpm dev` / `pnpm dev:peer` / `pnpm dev:bootstrap` 都从**同一个 `main.ts` 进入**，
靠 env 区分：

| 模式 | 启动命令 | 端口 | swarmPort | `SIDECAR_TOKEN` 来源 |
| --- | --- | --- | --- | --- |
| `dev` | `pnpm dev` | `.env.development` (默认 4321) | `.env.development` | `.env.development` |
| `dev:peer` | `pnpm dev:peer` | `.env.peer` (默认 4322) | `.env.peer` | `.env.peer` |
| `dev:bootstrap` | `pnpm dev:bootstrap` | `.env.bootstrap` | `.env.bootstrap` | `.env.bootstrap` |

`apps/sidecar/package.json` 里 `dev:peer` / `dev:bootstrap` 用 `dotenvx run --env-file=.env.<x> -- tsx src/main.ts`
加载对应 env 文件，主程序从 `process.env` 读环境变量，无需关心来源。

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
- **NestJS constructor param 必须 `@Inject(ClassRef)`**：因为 vitest 用 esbuild 编译 TS，
  不保留 `design:paramtypes` 元数据。所有 controller / service 的 constructor 必须显式
  `@Inject(ClassRef)`，否则注入失败、依赖为 `undefined`。这条规则同样适用于
  `BootstrapModule` 里 SDK-driven 的 `useFactory`：`useFactory` 函数参数不能用 `@Inject`，
  必须放在 `inject: [...]` 数组里。

## 5. 进一步阅读

- `docs/hyper-sdk-capability-map.md` — drive 能力 → 文件 / 函数映射表
- `docs/hyper-sdk-acl.md` — 现存边界守护（ESLint `no-restricted-imports`）
- `apps/sidecar/README.md` — sidecar 本地使用文档
- `apps/sidecar/test/openapi.snapshot.json` — 9 个路由的 OpenAPI 输出快照
