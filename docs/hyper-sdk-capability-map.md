# Hyper SDK Capability Map

> 这份文档回答一个具体问题：
> **"drive 的每一种能力，在 sidecar 的哪个文件、哪个函数里？"**
>
> 它不是 API 文档（完整签名见 [`hyper-sdk-design.md`](./hyper-sdk-design.md) §3），
> 也不是入门教程。它是一张**业务侧读代码时的"地图"**——
> 当你想动手改 sidecar 时，知道应该打开哪一个文件。
>
> 最近一次实质性更新：把 `apps/sidecar/src` 从裸 Fastify + CSR 五层
> 迁移到 **NestJS 11 on Express 4.21**：`core/`、`bootstrap/`、
> `feature-*/` 四层 + `infrastructure/` 边界 + `repositories/` 数据访问 +
> `services/` 业务规则。

---

## 一图速查

```
apps/sidecar/src 下全部与 drive / swarm / file / nest 相关的代码

├── core/                              ← 跨模块基础设施
│   ├── config/
│   │   ├── env.schema.ts              Zod 配置 schema + validateOrThrow
│   │   └── config.module.ts           @nestjs/config 包装
│   ├── logging/
│   │   └── logger.module.ts           nestjs-pino 配置
│   ├── sdk/
│   │   └── sdk.module.ts              CoreSdkModule.forRootAsync() + SdkLifecycle
│   ├── common/
│   │   ├── filters/http-exception.filter.ts
│   │   ├── middleware/raw-body.middleware.ts
│   │   ├── decorators/{raw-body,body-optional,current-key-id}.decorator.ts
│   │   └── zod/schema-registry.ts     nestjs-zod bridge (lazy patch)
│   ├── middleware/
│   │   └── auth.middleware.ts         AuthMiddleware (Bearer JWT + X-Sidecar-Token)
│   └── swagger/
│       ├── swagger-setup.ts           buildOpenAPI()
│       └── security.constants.ts      SECURITY_BEARER
│
├── infrastructure/                    ← 跨层原语 + SDK 边界
│   ├── sdk/index.ts                   hyper-sdk 的唯一 import 点
│   ├── types/
│   │   ├── dto.ts                     wire-format DTOs
│   │   ├── hyperdrive.ts              HyperdriveLike 结构类型
│   │   └── key.ts                     hex / driveKey 编解码
│   └── errors/index.ts                SidecarError + 错误码 → HTTP 状态码
│
├── repositories/                      ← 数据访问层
│   ├── drive.repository.ts            interface + HyperdriveRepository
│   ├── drive-index.repository.ts      interface + FileSystemDriveIndexRepository
│   ├── peer-connection.repository.ts  interface + HyperdriveSwarmRepository
│   └── index.ts                       barrel
│
├── services/                          ← 业务规则（@Injectable class-based）
│   ├── drives.service.ts              class DriveService
│   ├── files.service.ts               class FileService
│   └── swarm.service.ts               class SwarmService
│
├── bootstrap/                         ← composition root + 共享 in-memory 状态
│   ├── bootstrap.module.ts            @Global() @Module() + BootstrapService
│   └── drive-registry.ts              class InMemoryDriveRegistry
│
├── feature-health/                    ← NestJS feature modules（每个资源一个目录）
│   ├── health.controller.ts           GET /healthz
│   ├── health.module.ts
│   └── dto/index.ts                   Zod schemas → createZodDto DTOs
│
├── feature-auth/
│   ├── auth.controller.ts             POST /v1/auth/token
│   ├── auth.module.ts                 import + MiddlewareConsumer.apply(AuthMiddleware)
│   └── dto/index.ts
│
├── feature-drives/
│   ├── drives.controller.ts           /v1/drives/* + /v1/drives/:key/{tree,entry,file}
│   ├── test.controller.ts             /v1/_test/peer       (test-only)
│   ├── drives.module.ts
│   └── dto/index.ts
│
├── feature-swarm/
│   ├── swarm.controller.ts            /v1/swarm/{announce,peers,mount,unmount}
│   ├── identity.controller.ts         GET /v1/identity
│   ├── swarm.module.ts
│   └── dto/index.ts
│
├── auth/                              ← 加密原语（JWT + API key）
│
├── config-loader.ts                   early loadConfig() for main.ts (前 Nest 阶段)
├── app.module.ts                      根 @Module({ imports: [...] })
└── main.ts                            NestFactory.create<NestExpressApplication>(AppModule)
```

---

## 能力 → 文件 / 函数

### Drive 元数据

| 能力 | 文件 | 类 / 函数 |
| --- | --- | --- |
| 列出所有 drive | `services/drives.service.ts` | `DriveService.list()` |
| 创建一个 drive | `services/drives.service.ts` | `DriveService.create(name, type)` |
| 删一个 drive | `services/drives.service.ts` | `DriveService.remove(driveKey)` |
| `DriveDescriptor` 类型 | `feature-drives/dto/index.ts` | `DriveDescriptorDto` |
| `DriveType` 类型 | `feature-drives/dto/index.ts` | `z.enum(['metadata', 'blob'])` |
| 业务元数据持久化 | `repositories/drive-index.repository.ts` | `FileSystemDriveIndexRepository` (interface `DriveIndexRepository`) |
| 启动时从 index 恢复 | `bootstrap/bootstrap.module.ts` | `BootstrapService.onModuleInit` 内 `index.load()` |

### Drive 文件操作

| 能力 | HTTP | 文件 | 类 / 函数 |
| --- | --- | --- | --- |
| 拿单条 entry | `GET /v1/drives/:key/entry` | `services/files.service.ts` | `FileService.getEntry(key, path, wait)` |
| 列目录 | `GET /v1/drives/:key/tree` | `services/files.service.ts` | `FileService.getTree(key, prefix, wait)` |
| 读文件流 | `GET /v1/drives/:key/file` | `services/files.service.ts` | `FileService.readStream(key, path, wait)` |
| 写文件 | `PUT /v1/drives/:key/file` | `services/files.service.ts` | `FileService.write(key, path, body, meta)` |
| 删文件 / 目录 | `DELETE /v1/drives/:key/file` | `services/files.service.ts` | `FileService.deleteEntry(key, path, recursive)` |
| 拒绝写入远端 drive | （断言） | `services/files.service.ts` | `if (this.registry.isRemote(driveKey)) throw ...` |
| raw body 取回 Buffer | （中间件） | `core/common/middleware/raw-body.middleware.ts` | `(req as any)[RAW_BODY_KEY]` |
| 路由 `body` 参数提 Buffer | `@RawBody()` | `core/common/decorators/raw-body.decorator.ts` | 自定义 param decorator |
| 路由 `body` 可选 | `@BodyOptional()` | `core/common/decorators/body-optional.decorator.ts` | 自定义 param decorator |

### Drive 挂载

| 能力 | 文件 | 类 / 函数 |
| --- | --- | --- |
| 注册本地 drive（UUID → 实例） | `bootstrap/drive-registry.ts` | `InMemoryDriveRegistry.rememberLocal(uuid, drive)` |
| 注册远端 drive（driveKey → 实例） | `bootstrap/drive-registry.ts` | `InMemoryDriveRegistry.rememberRemote(driveKey, drive)` |
| 按 driveKey 找 drive | `bootstrap/drive-registry.ts` | `InMemoryDriveRegistry.byKey(driveKey)` |
| 按 UUID 找 drive | `bootstrap/drive-registry.ts` | `InMemoryDriveRegistry.byNamespace(uuid)` |
| 关闭远端 mount | `bootstrap/drive-registry.ts` | `InMemoryDriveRegistry.closeRemote(driveKey)` |
| 忘记本地 drive | `bootstrap/drive-registry.ts` | `InMemoryDriveRegistry.forgetLocal(uuid)` |
| 启动时恢复全部 drive | `bootstrap/bootstrap.module.ts` | `BootstrapService.onModuleInit` 循环 `index.entries()` + `drives.openLocal(uuid)` |
| 启动时挂 main drive | `bootstrap/bootstrap.module.ts` | `BootstrapService.onModuleInit` `drives.openLocal(MAIN_NAMESPACE)` |
| 注入 current kid 进 request | `@CurrentKeyId()` | `core/common/decorators/current-key-id.decorator.ts` |

### Swarm / 网络

| 能力 | HTTP | 文件 | 类 / 函数 |
| --- | --- | --- | --- |
| 广播 announce | `POST /v1/swarm/announce` | `services/swarm.service.ts` | `SwarmService.announce(wait)` |
| 列出已连接 peer | `GET /v1/swarm/peers` | `services/swarm.service.ts` | `SwarmService.getPeers()` |
| 挂远端 drive | `POST /v1/swarm/mount/:pk` | `services/swarm.service.ts` | `SwarmService.mount(publicKey)` |
| 卸载远端 drive | `POST /v1/swarm/unmount/:pk` | `services/swarm.service.ts` | `SwarmService.unmount(publicKey)` |
| 节点身份 | `GET /v1/identity` | `services/swarm.service.ts` | `SwarmService.identity()` |
| `sdk.connections` 数据源 | （内部） | `repositories/peer-connection.repository.ts` | `HyperdriveSwarmRepository.list()` |
| 解析 swarm 端口 | （内部） | `services/swarm.service.ts` | `SwarmService.resolvedSwarmPort()` (lazy) |
| 注入 test-only 合成 peer | `POST /v1/_test/peer` | `feature-drives/test.controller.ts` | `TestController.injectPeer` |
| 删除 test-only 合成 peer | `DELETE /v1/_test/peer/:pk` | `feature-drives/test.controller.ts` | `TestController.removePeer` |

### 身份 / 元数据

| 能力 | 文件 | 类 / 函数 |
| --- | --- | --- |
| `IdentityInfo` DTO | `feature-swarm/dto/index.ts` | `IdentityInfoDto` |
| `PeerInfo` DTO | `feature-swarm/dto/index.ts` | `PeerInfoDto` |
| `peerCount` 计算 | `services/swarm.service.ts` | `SwarmService.identity()` → `connections.count()` |
| `peerPublicKey` 计算 | `services/swarm.service.ts` | `SwarmService.identity()` → `toHexKey(sdk.publicKey)` |
| `mainDriveKey` 计算 | `services/swarm.service.ts` | `SwarmService.mainDriveKey()` (lazy, 注入 registry) |

### 错误 / 边界

| 能力 | 文件 | 类 / 函数 |
| --- | --- | --- |
| 抛出 `SidecarError` | `infrastructure/errors/index.ts` | `class SidecarError extends Error` |
| 错误码枚举 | `infrastructure/errors/index.ts` | `ErrorCode.*` |
| 错误 → HTTP 状态 | `infrastructure/errors/index.ts` | `httpStatusFor(code)` |
| 错误 → wire body | `infrastructure/errors/index.ts` | `toErrorBody(err)` |
| Drive 未挂载异常 | `services/files.service.ts` | `class DriveNotMountedError` |
| HTTP 错误序列化 | `core/common/filters/http-exception.filter.ts` | `HttpExceptionFilter.catch()` |
| Zod 校验失败 → 400 | `core/common/filters/http-exception.filter.ts` | `ZodValidationException` 分支 |
| Controller 显式抛 401 | `feature-auth/auth.controller.ts` | `new HttpException({...}, HttpStatus.UNAUTHORIZED)` |

### SDK 边界守护

| 能力 | 文件 |
| --- | --- |
| 唯一允许 `import 'hyper-sdk'` 的地方 | `infrastructure/sdk/index.ts` |
| 边界检查脚本 | `.eslintrc.cjs` (`no-restricted-imports` rule) |
| SDK 异步初始化（Nest 启动时） | `core/sdk/sdk.module.ts` (CoreSdkModule.forRootAsync) |
| SDK graceful shutdown | `core/sdk/sdk.module.ts` (SdkLifecycle implements OnModuleDestroy) |

---

## 关键不变量（invariants）

读了上面表格之后，下面这些 invariant 是必须遵守的，否则边界会乱：

1. **`HyperdriveLike` 不能跨过 `infrastructure/`**：在 `services/`、
   `repositories/` 里，drive 通过 `DriveRegistry.byKey(driveKey)` 取得，
   类型上看就是 `HyperdriveLike`。任何"在 services 里直接 `new Hyperdrive(...)`"
   的写法都违反分层。

2. **`SwarmService` 的 `getPeers()` 只能读 `PeerConnectionRepository`**：
   不能读 `sdk.connections` 直接，因为合成连接注入的目标是底层 `Set`。
   两者在测试时表现不一致。

3. **`DriveIndexRepository` 是真值源（source of truth）**：业务元数据
   （name / type / createdAt）在 `FileSystemDriveIndexRepository` 的
   JSON 文件里，不在 `DriveRegistry`（registry 只是 in-memory cache）。
   重启后 `BootstrapService.onModuleInit` 从 index 文件重新加载。

4. **driveKey 永远是 64-char lowercase hex**：跨 `Buffer` / `string` 一律走
   `infrastructure/types/key.ts::toHexKey` / `driveKeyOf`。schema 校验
   (`Hex64`) 用同一个正则，保证 HTTP 边界也是这个格式。

5. **`main` drive 不可 remove**：`FileSystemDriveIndexRepository.remove`
   显式拒绝 `uuid === 'main'`，`DriveService.remove` 也再做一次检查。
   两层防御。

6. **Repositories 不接触 express，业务规则不接触 SDK**：`repositories/`
   只依赖 `infrastructure/`；`services/` 只依赖 `infrastructure/` +
   `repositories/`（接口）+ `bootstrap/drive-registry`。任何反向引用
   都是分层破坏。

7. **NestJS controller / service constructor 必须显式 `@Inject(ClassRef)`**：
   因为 vitest 用 esbuild 编译 TS，**不**保留 `design:paramtypes` 元数据。
   任何 controller / service 缺 `@Inject()` 时，注入会得到 `undefined`。
   `useFactory` 的参数必须放在 `inject: [...]` 数组里，不能用 `@Inject`。

---

## 修改某个能力时该打开哪个文件

- 想改 **HTTP 路径 / 校验 / 响应 schema** → `feature-<name>/controllers/<name>.controller.ts`
  + `feature-<name>/dto/index.ts`
- 想改 **drive 业务规则**（创建流程、UUID namespace、删除逻辑）→
  `services/drives.service.ts`
- 想改 **文件操作业务规则**（isRemote 拒绝、recursive 策略）→
  `services/files.service.ts`
- 想改 **swarm 业务规则**（announce 时机、peers 过滤）→ `services/swarm.service.ts`
- 想改 **挂载表行为**（寻址 / 远端 vs 本地）→ `bootstrap/drive-registry.ts`
- 想改 **Hyperdrive 调用方式**（多调一个方法、改错误处理）→
  `repositories/drive.repository.ts` + `infrastructure/types/hyperdrive.ts`（同步加）
- 想改 **数据访问技术**（JSON → RocksDB 等）→ `repositories/drive-index.repository.ts`
- 想改 **DTO / 服务接口形状** → `feature-<name>/dto/index.ts` +
  `services/*.service.ts`
- 想改 **hex / driveKey 处理** → `infrastructure/types/key.ts`
- 想改 **错误 → HTTP 状态映射** → `infrastructure/errors/index.ts`
  + `core/common/filters/http-exception.filter.ts`
- 想改 **认证规则** → `auth/jwt.ts` + `auth/keys.ts` +
  `core/middleware/auth.middleware.ts`
- 想改 **新增依赖装配**（services / repositories / 第三方 client）→
  `bootstrap/bootstrap.module.ts`
- 想改 **OpenAPI 文档生成** → `core/swagger/swagger-setup.ts` +
  各自 controller 上的 `@ApiOkResponse` / `@ApiTags` 装饰器
- 想改 **新增 SDK 调用方式** → `infrastructure/sdk/index.ts` + 暴露 token /
  `CoreSdkModule` 的 `forRootAsync()`
