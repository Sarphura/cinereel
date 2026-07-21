# Hyper SDK Access Control（运行时代码门禁）

> 回答一个具体问题：
> **"业务侧（sidecar、桌面端、未来任何 app）能不能绕过 `@cinereel/hyper-sdk` 的封装，直接拿到底层 hyper 实例？"**
>
> 答：理论上能用类型断言 + 运行时反射拿到，**栈检查会在 `__hyperByKey` 入口处把它拦下来**。
>
> 详细 API 文档见 [`hyper-sdk-design.md`](./hyper-sdk-design.md)；
> drive 能力分布见 [`hyper-sdk-capability-map.md`](./hyper-sdk-capability-map.md)。

---

## 威胁模型

我们要防的是**意外泄漏 + 顺手走捷径**，而不是国家级对手。具体覆盖：

| 防御目标 | 是否覆盖 |
| --- | --- |
| 业务代码意外 `import type { HyperdriveInstance } from '@cinereel/hyper-sdk'` | ✓ TS 编译器拒 |
| 业务代码 `import { HyperdriveInstance } from 'hyperdrive'` | 留 ESLint 卡口（建议加） |
| 业务代码 `as unknown as InternalStoreRuntime` 后调 `__hyperByKey` | ✓ 栈检查拒 |
| 攻击者改 SDK 源码往里加 backdoor | ✗ 物理访问，拱手让出 |
| 攻击者 hack V8 栈帧 / 改 `Error.prepareStackTrace` | ✗ 超出威胁模型 |

---

## 三层防御，按从外到内

### Layer 1 · TypeScript 类型层

`packages/hyper-sdk/src/index.ts` 是公开面。它**不重导出**：

```13:24:packages/hyper-sdk/src/runtime/corestore.ts
export interface InternalStoreRuntime extends StoreRuntime {
  /** Resolve a driveKey (hex) to its underlying hyperdrive instance. */
  __hyperByKey: (publicKey: string) => Promise<HyperdriveInstance>;
  /** Look up the underlying hyperdrive instance by its Corestore namespace. */
  __hyperByName: (name: string) => HyperdriveInstance | null;
}
```

- `InternalStoreRuntime` —— interface 名字以 `Internal` 开头，且**不在 `index.ts` 重导出**
- `__hyperByKey` / `__hyperByName` —— 双下划线前缀，约定内部 API
- `HyperdriveInstance` —— hyper 实例类型，仅在 `types/hyper.ts` 内部使用,不在 `index.ts` 重导出

效果：

```ts
// 业务侧这样写，TS 直接报错：
import { HyperdriveInstance } from '@cinereel/hyper-sdk';
//                          ^^^^^^^^^^^^^^^ Module has no exported member 'HyperdriveInstance'
```

**但**这只是编译期保护。运行时把 `runtime as unknown as InternalStoreRuntime` 仍然走得过去 —— 这就是 Layer 3 的工作。

### Layer 2 · 模块物理隔离

`@cinereel/hyper-sdk` 是独立 npm 包（独立 `package.json`、独立 `tsconfig.json`），
不只是 sidecar 内部的子目录。这个物理隔离让：

- **包级路径解析**能成立（Layer 3 的关键）
- **peerDependencies** 收敛在一处（hypercore 升级只在 SDK 包升级）
- **独立 vitest** 跑 hyper 行为（不起 sidecar 集成环境）

如果"封装"塞进 sidecar 内部一个文件夹，Layer 2 自动失效 —— 业务侧能直接走到
封装目录里 `import` 未导出的 helper；栈检查也因 sidecar 整目录都是包根而等于关掉。

### Layer 3 · 运行时栈检查

`packages/hyper-sdk/src/utils/acl.ts` 是这套 ACL 的兜底。

#### 初始化：找到包根

```22:46:packages/hyper-sdk/src/utils/acl.ts
function hereFilePath(): string {
  if (typeof import.meta?.url === 'string') {
    return fileURLToPath(import.meta.url);
  }
  if (typeof __dirname === 'string') return __dirname;
  throw new Error('cannot resolve current module path');
}

function detectPackageRoot(): void {
  let dir: string;
  try {
    dir = hereFilePath();
  } catch (err) {
    aclDisabledReason = (err as Error).message;
    return;
  }
  for (let i = 0; i < 6; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    const pkgPath = path.join(parent, 'package.json');
    let pkg: { name?: string } | null = null;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
    } catch {
      pkg = null;
    }
    if (pkg && pkg.name === '@cinereel/hyper-sdk') {
      packageRoot = parent;
      return;
    }
    dir = parent;
  }
  aclDisabledReason = 'package.json with name @cinereel/hyper-sdk not found in any ancestor';
}

detectPackageRoot();
```

- 用 `import.meta.url` 拿到本文件当前路径（ESM）
- 上溯 6 层找最近的 `package.json`
- 名字必须是 `'@cinereel/hyper-sdk'`，否则 fail-open 并 warn
- bundler 重写模块 URL 导致找不到根时，**fail-open（不抛）**——避免合法的 bundling 突然坏掉

#### 检查：扫描 V8 栈帧

```63:97:packages/hyper-sdk/src/utils/acl.ts
function callerInsidePackage(root: string): boolean {
  const stackHolder: { stack?: string } = {};
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(stackHolder, callerInsidePackage);
  } else {
    try {
      throw new Error('acl:stack');
    } catch (e) {
      stackHolder.stack = (e as Error).stack ?? '';
    }
  }
  const stack = stackHolder.stack ?? '';
  if (!stack) return false;

  const lines = stack.split('\n');
  for (const line of lines) {
    const m = line.match(/\(([^):]+):\d+:\d+\)|\bat\s+([^:\s]+):\d+:\d+/);
    const raw = m?.[1] ?? m?.[2];
    if (!raw) continue;
    let filePath: string;
    if (raw.startsWith('file://')) {
      try {
        filePath = fileURLToPath(raw);
      } catch {
        continue;
      }
    } else if (raw.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(raw)) {
      filePath = raw;
    } else {
      continue;
    }
    const normalized = path.normalize(filePath);
    if (normalized === root) continue;
    if (normalized.startsWith(root + path.sep)) return true;
  }
  return false;
}
```

- 用 `Error.captureStackTrace(holder, callee)` 跳过 callee 自己那一帧
- 至少**一帧**路径落在 `packageRoot` 下才放行
- 处理 `file:///abs/path:LINE:COL` 和 `/abs/path:LINE:COL` 两种 V8 frame 格式

#### 入口：每个 internal API 都得校验

```212:218:packages/hyper-sdk/src/runtime/corestore.ts
async function __hyperByKey(publicKey: string): Promise<HyperdriveInstance> {
    assertCallerInPackage();
    const { hex, buffer } = normalizeAndValidateDriveKey(publicKey);
    const hit = byKey.get(hex);
    if (hit) return hit;
    const d = await mountByKey(store, buffer);
    byKey.set(hex, d);
    return d;
  }
```

`__hyperByKey` / `__hyperByName` 都是 SDK 内部 helper，但**它们返回的数据本身不敏感**（hyper 实例是 SDK 自己造的，理论上所有人都能复制 SDK 行为）。价值在于：**让"违规访问"的事实在那一刻被抓到**，而不是让这种访问悄悄发生一年后才出 bug。

---

## 为什么这层不是多余

理论上，外部代码**完全可以通过以下方式重写 SDK 行为**：

1. 重新实现一遍 `createStoreRuntime`
2. 或直接 `import Corestore from 'corestore'` 重新造一套 runtime

那栈检查防什么呢？防**"业务侧碰巧拿到 hyper 实例但又不想重写 SDK"这种偷懒**。

这种偷懒的真实风险：

- 业务代码 A 拿到 hyper 实例 → 调 hyper v11 的某个私有方法 → SDK 升级到 v13 后这个方法名变了 → 只有 A 这一处被改，但 SDK 其它地方都假设 v13 API → 数据损坏 / race condition
- 业务代码 B 越过 SDK 自己存了一份 drive 的元数据 → SDK 升级时元数据格式变了 → B 拿着旧 key 调 SDK 触发 hard-to-debug 的 invariant 违反

ACL 的真正目的不是保密 hyper 实例（hyper 完全开源），而是**保护 SDK 的不变量不让业务侧碰**。

---

## 限制与生效范围

| 限制 | 影响 | 缓解 |
| --- | --- | --- |
| 栈帧可被 `Error.prepareStackTrace` 改写 | 攻击者能伪造栈 | 超出威胁模型 |
| Bundler 重写模块 URL | 包根解析失败，fail-open | 已记录为 warning，CI 应感知 |
| V8 帧去优化（inlining 后 frame 名消失） | 帧里没函数名但有路径 | 解析仍看路径，不依赖函数名 |
| `--enable-source-maps=false` 之外的 source map | 帧路径是编译后位置 | 影响调试不影响逻辑，仍能跨过验收 |
| Hyperdrive 实例本身被泄漏到 closure 外 | 后面所有内部 helper 都被传染 | ACL 截断点（继续往下追） |

---

## CI 卡口建议（未实现，应加）

我们目前依赖：

- TS 编译期不重导出 ✓
- 运行时栈检查 ✓
- ESLint 卡业务侧 import hyper 包 ✗

**建议新增** `scripts/lint-no-hyper-leak.sh`（或 ESLint `no-restricted-imports`）：

```js
// .eslintrc.cjs / eslint.config.js
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['hyperdrive', 'hyperdrive/*',
                  'corestore', 'corestore/*',
                  'hyperswarm', 'hyperswarm/*',
                  'hypercore', 'hypercore/*'],
          message: 'Do not import hyper packages directly. Use @cinereel/hyper-sdk.',
        },
      ],
    }],
  },
}
```

只对 `apps/*` 与 `packages/hyper-sdk` 之外的 `packages/*` 启用。
SDK 包自身正常 import hyper —— 这正是它的工作。

加这道卡口让"封装是边界"从约定变成可机械执行的守门，配合现有两层防御形成闭环。

---

## 这套 ACL 想保护什么（反向列表）

不允许业务侧做的事；想做就改 SDK：

| 想做的事 | 该改哪 | 现在状态 |
| --- | --- | --- |
| 拿到 hyper 实例直接调 `.db` / `.core` / `.checkout` | `__hyper*`，但栈检查挡 | 拒绝 |
| 自己拿 `corestore.namespace(name)` 造 drive | 无 wrapper | 拒绝（hyper 包未暴露） |
| 持久化 drive 名字、类型 | `Drive` 类型有这些字段 | 允许走 `Drive` |
| 直接调 v11 私有 API | 拿到 hyper 实例后调 | 拒绝（拿不到） |
| 自己定义 Drive schema 字段 | `Drive` 不够 | 找 SDK 加字段 |
| 给某 drive 加自定义 ACL | 业务语义，留 sidecar | 不应进 SDK |

