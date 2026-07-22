# Hyper SDK Access Control（业务边界现状）

> 回答一个具体问题：
> **"业务侧（sidecar、桌面端、未来任何 app）能不能绕过 `hyper-sdk`
> 的封装，直接拿到底层 hyper 实例？"**
>
> 答：**能**，官方 `hyper-sdk@^6.2.2` 公开 `Hyperdrive` /
> `Hypercore` 实例，sidecar 不做反腐蚀层。**唯一的"门禁"**是
> `apps/sidecar/.eslintrc.cjs` 里的 `no-restricted-imports` 规则——
> 它阻止业务侧绕过 `hyper-sdk` 直接 import `corestore` / `hyperdrive` /
> `hyperswarm` / `hypercore`，**以及**让 `src/` 下只有一个文件
> （`infrastructure/sdk/index.ts`）能直接 `import 'hyper-sdk'`。
>
> 详细 API 文档见 [`hyper-sdk-design.md`](./hyper-sdk-design.md)；
> drive 能力分布见 [`hyper-sdk-capability-map.md`](./hyper-sdk-capability-map.md)。

---

## 现状（2026-07 之后，NestJS 重构之后）

迁移到 NestJS on Express 之后，sidecar 的边界是这样：

```
┌────────────────────────────────────────────────────────────────┐
│ 业务侧（HTTP controller）                                       │
│ apps/sidecar/src/feature-*/controllers/*.controller.ts          │
│ - 只看到 FileService / SwarmService / DriveService              │
│ - 不出现 Hyperdrive / SDK / Corestore / Hyperswarm 这些名字     │
└────────────────────────────────────────────────────────────────┘
                              │ @Inject(<ServiceClass>) services
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ services 层  apps/sidecar/src/services/*                        │
│ - DriveService / FileService / SwarmService (@Injectable)       │
│ - 通过 DriveRegistry 拿到 HyperdriveLike                        │
│ - 不接触 express / nestjs                                       │
└────────────────────────────────────────────────────────────────┘
                              │ @Inject(<RepositoryClass>) repos
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ repositories 层  apps/sidecar/src/repositories/*                │
│ - DriveRepository / DriveIndexRepository /                     │
│   PeerConnectionRepository (interfaces + classes + fakes)       │
│ - HyperdriveRepository 是 SDK 的唯一适配点                      │
│ - 不接触 express / nestjs / 业务规则                            │
└────────────────────────────────────────────────────────────────┘
                              │ 通过 SDK_TOKEN / 单一入口
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ infrastructure/sdk  apps/sidecar/src/infrastructure/sdk/        │
│ - sdk/index.ts 是 src/ 下唯一 import 'hyper-sdk' 的文件         │
│ - 由 CoreSdkModule.forRootAsync() 在 Nest 启动时初始化，          │
│   通过 SDK_TOKEN 暴露给其它模块                                 │
└────────────────────────────────────────────────────────────────┘
                              │ import 'hyper-sdk'
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ hyper-sdk@^6.2.2                                               │
│ - 公开 Hyperdrive / Hypercore / Corestore / Hyperswarm 实例     │
│ - 业务侧如果直接拿到这些实例，可以调任意 hyper v13 API          │
└────────────────────────────────────────────────────────────────┘
```

边界由两层机制保证：

1. **物理隔离（机械）**：ESLint `no-restricted-imports` 在 CI + IDE 中
   拒绝 `src/` / `test/` 下任何文件直接 `import 'hypercore' /
   'hyperdrive' / 'hyperswarm' / 'corestore'`，**并且**拒绝除
   `infrastructure/sdk/index.ts` 外任何文件 `import 'hyper-sdk'`。
   配置在 `apps/sidecar/.eslintrc.cjs`。
2. **类型层（约定）**：`HyperdriveLike` 结构类型在
   `infrastructure/types/hyperdrive.ts` 定义；HTTP 路由（controllers）
   拿到的总是 `FileService` / `SwarmService` 接口——它们不 import
   `HyperdriveLike`。但这不是编译期强制：业务侧可以
   `as unknown as HyperdriveLike` 拿到 hyper 实例。

> 旧的 `apps/sidecar/scripts/check-sdk-boundary.sh` 已经被
>  ESLint 规则取代。规则运行时机更早（编辑保存 + `pnpm lint`），覆盖面相同。
> ESLint 也可以识别 ESM（`import 'x'`、`import('x')`）而 bash grep 不能。

---

## 自建 SDK 时代的 ACL 历史

历史上 sidecar 用过自建 `@cinereel/hyper-sdk` 包（独立 package.json、
独立 tsconfig），实现过三层 ACL：

| 层 | 实现 | 文件 |
|---|---|---|
| TypeScript 类型层 | 不重导出 `HyperdriveInstance` / `InternalStoreRuntime` | `packages/hyper-sdk/src/index.ts` |
| 模块物理隔离 | 独立 package + `check-sdk-boundary.sh` | `apps/sidecar/scripts/check-sdk-boundary.sh` |
| 运行时栈检查 | `Error.captureStackTrace` 扫描 V8 帧，至少一帧必须落在 SDK 包根 | `packages/hyper-sdk/src/utils/acl.ts` |

自建包 2026-07 删除后这三层 ACL **全部消失**，因为：

1. **官方 SDK 公开 Hyperdrive 实例**，根本没有"内部 API"可以保护
2. **Layer 2（物理隔离）保留**——ESLint 规则现在阻止
   业务侧 `import 'corestore' / 'hyperdrive' / 'hyperswarm' / 'hypercore'`
   **直接**依赖这些底层包，**并且**强制 `hyper-sdk` 只能从
   `infrastructure/sdk/index.ts` import
3. **Layer 1（类型层）弱化**——`HyperdriveLike` 结构子集在
   `infrastructure/types/hyperdrive.ts` 里定义，HTTP 路由接
   `FileService` / `SwarmService` 接口而不是 `HyperdriveLike`，但这
   不是编译期强制 —— 业务侧可以 `as unknown as HyperdriveLike` 拿到
   hyper 实例
4. **Layer 3（运行时栈检查）**删除 —— 官方 SDK 不暴露内部 API，
   无栈可检

---

## 现在的威胁模型

| 防御目标 | 是否覆盖 |
|---|---|
| 业务侧 `import 'hyperdrive' / 'hyperswarm' / 'corestore' / 'hypercore'` | ✓ ESLint 拒 |
| `src/` 下多处直接 `import 'hyper-sdk'` | ✓ ESLint 拒（只允许 `infrastructure/sdk/index.ts`） |
| 业务侧 `import { SDK } from 'hyper-sdk'` 然后 `sdk.getDrive(...)` 拿 `Hyperdrive` | ✗ 无防御（官方 SDK 不挡） |
| 业务侧 `as unknown as HyperdriveShape` 调 hyper v13 私有 API | ✗ 无防御 |
| 攻击者改 sidecar 源码往里加 backdoor | ✗ 物理访问，拱手让出 |
| 攻击者 hack V8 栈帧 / 改 `Error.prepareStackTrace` | ✗ 超出威胁模型 |

**结论**：hyper-sdk 时代我们对"业务侧碰巧拿到 hyper 实例但又不想重写 SDK
这种偷懒"的保护 = **零**。这是用官方 SDK 的必然代价。

如果哪天 hyper v13 升级到 v14 时某私有方法被改名，靠的不是 ACL 而是
集成测试 + smoke 脚本（`apps/sidecar/test/wire-equivalence.spec.ts` +
`apps/sidecar/test/smoke.e2e-spec.ts`）。

---

## 边界检查（ESLint 规则）

`.eslintrc.cjs` 用 `no-restricted-imports` 同时卡两条不变量：

```js
// apps/sidecar/.eslintrc.cjs
module.exports = {
  // …
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            // 任何业务侧文件都不能 import hyper 底层包
            group: [
              'hypercore', 'hypercore/*',
              'hyperdrive', 'hyperdrive/*',
              'hyperswarm', 'hyperswarm/*',
              'corestore', 'corestore/*',
            ],
            message: 'Do not import hyper packages directly. Use hyper-sdk.',
          },
          {
            // 只有 infrastructure/sdk/index.ts 能 import 'hyper-sdk'
            group: ['hyper-sdk'],
            message: 'hyper-sdk must only be imported from infrastructure/sdk/index.ts',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // infrastructure/sdk/index.ts 是 import 'hyper-sdk' 的唯一例外
      files: ['src/infrastructure/sdk/index.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
}
```

跑：

```bash
pnpm --filter @cinereel/sidecar lint
```

ESLint 会拒绝任何 `import 'hyper-sdk'` 出现在 `infrastructure/sdk/index.ts` 之外的
业务文件里，包括 `*.spec.ts` / `*.e2e-spec.ts` 测试文件（test/ 用同样的 override path）。

---

## 限制与生效范围

| 限制 | 影响 | 缓解 |
|---|---|---|
| 官方 SDK 直接返回 `Hyperdrive` 实例 | 业务侧可调任意 hyper v13 API | 无；集成测试 |
| 业务侧绕过 `hyper-sdk` 自己重写一套 | 失去了"SDK 升级一次性切换"的红利 | smoke 脚本 |
| `sdk.connections` 类型 vs 运行时不一致（TS 声明 `Connection[]`，运行时是 `Set`） | `connections.length` 返回 `undefined` | 文档 + 注释提醒 |

---

## 这套边界想保护什么（反向列表）

不允许业务侧做的事；想做就改 sidecar：

| 想做的事 | 该改哪 | 现在状态 |
|---|---|---|
| 自己 `import 'hyperdrive'` 拿实例 | 不允许，走 `hyper-sdk` | 拒绝（ESLint） |
| `src/` 下多处 `import 'hyper-sdk'` | 只允许 `infrastructure/sdk/index.ts` | 拒绝（ESLint） |
| 拿到 `Hyperdrive` 实例直接调私有 API | 无 wrapper | 允许（无防御） |
| 持久化 drive 名字、类型 | `DriveIndex` 在 sidecar 层 | 允许 |
| 自己定义 Drive schema 字段 | 改 `DriveDescriptor` DTO + `drive-index.repository.ts` | 允许 |
| 给某 drive 加自定义 ACL | 业务语义，留 sidecar | 不应进 SDK |
