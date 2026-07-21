# Hyper SDK Access Control（业务边界现状）

> 回答一个具体问题：
> **"业务侧（sidecar、桌面端、未来任何 app）能不能绕过 `hyper-sdk`
> 的封装，直接拿到底层 hyper 实例？"**
>
> 答：**能**，官方 `hyper-sdk@^6.2.2` 公开 `Hyperdrive` /
> `Hypercore` 实例，sidecar 不做反腐蚀层。**唯一的"门禁"**是
> `apps/sidecar/scripts/check-sdk-boundary.sh` —— 它阻止业务侧
> 绕过 `hyper-sdk` 直接 import `corestore` / `hyperdrive` /
> `hyperswarm` / `hypercore`，**以及**让 `src/` 下只有一个文件
> （`infrastructure/sdk/index.ts`）能直接 `import 'hyper-sdk'`。
>
> 详细 API 文档见 [`hyper-sdk-design.md`](./hyper-sdk-design.md)；
> drive 能力分布见 [`hyper-sdk-capability-map.md`](./hyper-sdk-capability-map.md)。

---

## 现状（2026-07 之后，CSR 五层重组之后）

迁移到官方 `hyper-sdk` 之后，sidecar 的边界是这样：

```
┌────────────────────────────────────────────────────────────────┐
│ 业务侧（HTTP controller）                                       │
│ apps/sidecar/src/controllers/*.controller.ts                    │
│ - 只看到 FileService / SwarmService / DriveService              │
│ - 不出现 Hyperdrive / SDK / Corestore / Hyperswarm 这些名字     │
└────────────────────────────────────────────────────────────────┘
                              │ import service classes
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ services 层  apps/sidecar/src/services/*                        │
│ - DriveService / FileService / SwarmService                     │
│ - 通过 DriveRegistry 拿到 HyperdriveLike                        │
│ - 不接触 fastify / node:http                                    │
└────────────────────────────────────────────────────────────────┘
                              │ depends on interfaces
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ repositories 层  apps/sidecar/src/repositories/*                │
│ - DriveRepository / DriveIndexRepository /                     │
│   PeerConnectionRepository (interfaces + classes + fakes)       │
│ - HyperdriveRepository 是 SDK 的唯一适配点                      │
│ - 不接触 fastify / 业务规则                                     │
└────────────────────────────────────────────────────────────────┘
                              │ import 'hyper-sdk'
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ infrastructure/sdk  apps/sidecar/src/infrastructure/sdk/        │
│ - sdk/index.ts 是 src/ 下唯一 import 'hyper-sdk' 的文件         │
└────────────────────────────────────────────────────────────────┘
                              │ import 'hyper-sdk'
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ hyper-sdk@^6.2.2                                              │
│ - 公开 Hyperdrive / Hypercore / Corestore / Hyperswarm 实例     │
│ - 业务侧如果直接拿到这些实例，可以调任意 hyper v13 API          │
└────────────────────────────────────────────────────────────────┘
```

边界由两层机制保证：

1. **物理隔离（机械）**：`scripts/check-sdk-boundary.sh` 在 CI 中
   拒绝 `src/` 下任何文件（除 `infrastructure/sdk/index.ts` 外）直接
   import `hypercore` / `hyperdrive` / `hyperswarm` / `corestore`。
2. **类型层（约定）**：`HyperdriveLike` 结构类型在
   `infrastructure/types/hyperdrive.ts` 定义，`HyperdriveLike` 不出现
   在 `controllers/` 或 `services/` 的 import 里——它们拿到的总是
   `FileService` / `SwarmService` / `DriveRegistry` 接口。

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
2. **Layer 2（物理隔离）保留**——`check-sdk-boundary.sh` 现在阻止
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
| 业务侧 `import 'hyperdrive' / 'hyperswarm' / 'corestore' / 'hypercore'` | ✓ `check-sdk-boundary.sh` 拒 |
| `src/` 下多处直接 `import 'hyper-sdk'` | ✓ `check-sdk-boundary.sh` 拒（只允许 `core/sdk.ts`） |
| 业务侧 `import { SDK } from 'hyper-sdk'` 然后 `sdk.getDrive(...)` 拿 `Hyperdrive` | ✗ 无防御（官方 SDK 不挡） |
| 业务侧 `as unknown as HyperdriveShape` 调 hyper v13 私有 API | ✗ 无防御 |
| 攻击者改 sidecar 源码往里加 backdoor | ✗ 物理访问，拱手让出 |
| 攻击者 hack V8 栈帧 / 改 `Error.prepareStackTrace` | ✗ 超出威胁模型 |

**结论**：hyper-sdk 时代我们对"业务侧碰巧拿到 hyper 实例但又不想重写 SDK
这种偷懒"的保护 = **零**。这是用官方 SDK 的必然代价。

如果哪天 hyper v13 升级到 v14 时某私有方法被改名，靠的不是 ACL 而是
集成测试 + smoke 脚本（`apps/sidecar/test-drive-key.ts` 之类）。

---

## 边界检查脚本

`apps/sidecar/scripts/check-sdk-boundary.sh`（CI 卡口）做两件事：

1. **扫描 `src/`**，禁止任何文件直接 `import 'hypercore' | 'hyperdrive' | 'hyperswarm' | 'corestore'`
2. **扫描 `src/`**，禁止除 `infrastructure/sdk/index.ts` 之外的任何文件 `import 'hyper-sdk'`

```bash
SDK='hypercore|hyperdrive|hyperswarm|corestore'
violations=0

scan_forbidden() {
  local label="$1" dir="$2"
  while IFS= read -r file; do
    matches=$( (grep -nE "from ['\"]($SDK)" "$file" || true) ; \
               (grep -nE "require\(['\"]($SDK)" "$file" || true) )
    if [ -n "$matches" ]; then
      echo "x hyper SDK leak in $label: $file"
      violations=$((violations + 1))
    fi
  done < <(find "$dir" -type f -name '*.ts')
}

# 业务侧不能直接 import 底层包
scan_forbidden "apps/sidecar/src" "$ROOT/src"
scan_forbidden "apps/sidecar/test" "$ROOT/test"

# 除 infrastructure/sdk/index.ts 之外，禁止 import 'hyper-sdk'
scan_hyper_sdk() {
  while IFS= read -r file; do
    # 允许的唯一文件
    if [ "$file" = "$ROOT/src/infrastructure/sdk/index.ts" ]; then continue; fi
    if grep -nE "from ['\"]hyper-sdk['\"]" "$file" >/dev/null 2>&1; then
      echo "x 'hyper-sdk' import outside infrastructure/sdk/index.ts: $file"
      violations=$((violations + 1))
    fi
  done < <(find "$ROOT/src" -type f -name '*.ts')
}
```

跑：

```bash
pnpm --filter @cinereel/sidecar check:sdk-boundary
```

---

## 限制与生效范围

| 限制 | 影响 | 缓解 |
|---|---|---|
| 官方 SDK 直接返回 `Hyperdrive` 实例 | 业务侧可调任意 hyper v13 API | 无；集成测试 |
| 业务侧绕过 `hyper-sdk` 自己重写一套 | 失去了"SDK 升级一次性切换"的红利 | smoke 脚本 |
| `sdk.connections` 类型 vs 运行时不一致（TS 声明 `Connection[]`，运行时是 `Set`） | `connections.length` 返回 `undefined` | 文档 + 注释提醒 |

---

## CI 卡口（建议新增）

我们目前依赖：

- `check-sdk-boundary.sh` 拒直接 import hyper 包 ✓
- `check-sdk-boundary.sh` 拒除 `infrastructure/sdk/index.ts` 之外 import `hyper-sdk` ✓
- HTTP 路由不直接接 `HyperdriveShape`（用接口屏蔽） ✓（约定，非机械）
- ESLint 卡业务侧 import hyper 包 ✗（**建议加**）

```js
// eslint.config.js
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['hyperdrive', 'hyperdrive/*',
                  'corestore', 'corestore/*',
                  'hyperswarm', 'hyperswarm/*',
                  'hypercore', 'hypercore/*'],
          message: 'Do not import hyper packages directly. Use hyper-sdk.',
        },
      ],
    }],
  },
}
```

`check-sdk-boundary.sh` 已经做这件事，但只在 bash 层。ESLint 卡口把
规则推到编辑器实时反馈 + IDE 提示，对新代码更友好。

---

## 这套边界想保护什么（反向列表）

不允许业务侧做的事；想做就改 sidecar：

| 想做的事 | 该改哪 | 现在状态 |
|---|---|---|
| 自己 `import 'hyperdrive'` 拿实例 | 不允许，走 `hyper-sdk` | 拒绝（check-sdk-boundary） |
| `src/` 下多处 `import 'hyper-sdk'` | 只允许 `infrastructure/sdk/index.ts` | 拒绝（check-sdk-boundary） |
| 拿到 `Hyperdrive` 实例直接调私有 API | 无 wrapper | 允许（无防御） |
| 持久化 drive 名字、类型 | `DriveIndex` 在 sidecar 层 | 允许 |
| 自己定义 Drive schema 字段 | 改 `DriveDescriptor` + `drive-index.ts` | 允许 |
| 给某 drive 加自定义 ACL | 业务语义，留 sidecar | 不应进 SDK |