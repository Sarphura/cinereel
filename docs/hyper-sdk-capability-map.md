# Hyper SDK Capability Map

> 这份文档回答一个具体问题：
> **"drive 的每一种能力，在 `@cinereel/hyper-sdk` 的哪个文件、哪个函数里？"**
>
> 它不是 API 文档（完整签名见 `hyper-sdk-design.md` §3），
> 也不是入门教程。它是一张**业务侧读代码时的"地图"**——
> 当你想动手改 SDK 时，知道应该打开哪一个文件。
>
> 最近一次实质性更新：把 `StoreRuntime.store` 字段搬进 `InternalStoreRuntime`，
> 并加入 `__hyperByKey` 的运行时栈检查；详见
> [`hyper-sdk-acl.md`](./hyper-sdk-acl.md)。

---

## 一图速查

```
业务侧 import '@cinereel/hyper-sdk' 看到的全部 drive 相关 API
│
├─ runtime/corestore.ts                  ← drive 生命周期的全部真相
│   ├─ createStoreRuntime(storeDir)      ── 入口：开 corestore + main drive
│   ├─ createDrive(type, name?)          ── 本地新建
│   ├─ mountDrive(name, type?)           ── 本地挂载
│   ├─ mountOrCreateDrive(name, type?)   ── 幂等入口（namespace 有数据则挂，否则建）
│   ├─ getDrive(name)                    ── 纯查（未挂载 → null）
│   ├─ listDrives()                      ── 列出本地已挂载
│   ├─ openDriveByKey(hex)               ── 远端挂载（按 driveKey）
│   ├─ closeDriveByKey(hex)              ── 关闭并摘除
│   └─ close()                           ── 关整个 store
│
├─ services/file.ts                      ← drive 上的文件级操作
│   └─ getEntry / getTree / readStream
│      / write / deleteEntry
│       走 runtime.__hyperByKey(hex) 拿底层 hyper 实例
│
├─ runtime/hyperswarm.ts                 ← drive 上 DHT 网络加入
│   └─ join(drive, flush?) / leave(drive) / destroy()
│       sidecar 在 createRuntime 时包成 SwarmRuntime 给业务侧
│
├─ services/swarm.ts                     ← 业务友好的网络 API（基于 key）
│   └─ announce / getPeers / mount / unmount / identity
│
├─ types/types.ts                        ← Drive, DriveType, HyperdriveEntry, TreeNode…
│
├─ utils/hyper.factory.ts                ← drive key 校验 + hex<->Buffer
│   └─ normalizeAndValidateDriveKey (Internal)
│   └─ InvalidDriveKeyError   (Re-exported from index.ts)
│
├─ types/hyper.ts                        ← HyperdriveInstance 类型（internal only）
│
└─ utils/acl.ts                          ← 运行时栈检查
    └─ assertCallerInPackage()           ── 不在 SDK 包内直接调用 → throw
```

---

## 一行索引（业务侧最常找的）

| 业务诉求 | 打开的文件 | 关键函数 / 类型 |
| --- | --- | --- |
| "我要新建一个 drive" | `runtime/corestore.ts` | `createDrive(type, name?)` |
| "我要按名字找 drive" | `runtime/corestore.ts` | `getDrive(name)` / `listDrives()` |
| "我要按公钥打开一个远端 drive" | `runtime/corestore.ts` | `openDriveByKey(hex)` |
| "我要把已挂载的 drive 关掉" | `runtime/corestore.ts` | `closeDriveByKey(hex)` |
| "我要把 drive 挂到 P2P 网络" | `services/swarm.ts` | `mount(publicKey)` |
| "我要在 drive 里读 / 写文件" | `services/file.ts` | `getEntry` / `getTree` / `readStream` / `write` |
| "我的 drive key 格式不对" | `utils/hyper.factory.ts` | `InvalidDriveKeyError` |
| "ACL 阻止我访问某个内部 API" | `utils/acl.ts` | `AclViolationError` |

---

## drive 的三种"姿势"

drive 在 SDK 里出现三种姿势，**任何 drive 行为都要先回答属于哪一种**：

### 姿势 A：本地 + 按名字（namespace）

```ts
// runtime/corestore.ts:55
async function mountByName(store: Store, name: string): Promise<HyperdriveInstance> {
  const d = new HyperdriveCtor(store.namespace(name));
  await d.ready();
  return d;
}
```

- 用 `store.namespace(name)` 隔离存储
- name 默认是 `crypto.randomUUID()`
- 启动恢复时由 sidecar 用保存的 uuid 重新挂载
- 这是"本地新建 + 本地挂载"的底层原语

### 姿势 B：远端 + 按公钥（session）

```ts
// runtime/corestore.ts:62
async function mountByKey(store: Store, publicKey: Buffer): Promise<HyperdriveInstance> {
  const d = new HyperdriveCtor(store.session(), publicKey);
  await d.ready();
  return d;
}
```

- 用 `store.session()` + 显式 `publicKey` Buffer
- key 必须经过 `normalizeAndValidateDriveKey` 校验（64-char hex，剥 `0x`）
- 这是 `openDriveByKey` 的底层原语

### 姿势 C：复用（已挂载列表）

- `drives: Map<name, HyperdriveInstance>` —— name 索引
- `byKey: Map<hex, HyperdriveInstance>` —— driveKey 索引
- `typesByName: Map<name, DriveType>` —— 业务类型索引
- 任何"已挂载则复用"的行为都靠这三个 map

---

## ACL 边界："drive"走到哪一层突然不让业务侧碰？

业务侧拿到的 `StoreRuntime` 是 public surface：

```23:78:packages/hyper-sdk/src/runtime/corestore.ts
export interface StoreRuntime {
  main: Drive;
  createDrive: (name?: string, type?: DriveType) => Promise<Drive>;
  mountDrive: (name: string, type?: DriveType) => Promise<Drive>;
  mountOrCreateDrive: (name: string, type?: DriveType) => Promise<Drive>;
  getDrive: (name: string) => Drive | null;
  listDrives: () => Drive[];
  openDriveByKey: (driveKey: string) => Promise<Drive>;
  closeDriveByKey: (driveKey: string) => Promise<void>;
  close: () => Promise<void>;
}
```

注意 **没有**：

- 没有 `HyperdriveInstance`（业务不知道 hyper 类）
- 没有 `store`（业务拿不到 corestore）
- 没有 `__hyperByKey` / `__hyperByName`（双下划线前缀是 SDK 内部标记）
- 没有 `driveKeyOf`（曾经导出过，已移除）

三道 ACL（详见 [`hyper-sdk-acl.md`](./hyper-sdk-acl.md)）：

1. **TypeScript 类型系统**：`index.ts` 不重导出 `HyperdriveInstance` / `InternalStoreRuntime` / `__hyper*`
2. **模块物理隔离**：业务 TS 文件 `import { HyperdriveInstance } from '@cinereel/hyper-sdk'` 会编译失败
3. **运行时栈检查**：`__hyperByKey` 入口会扫描 V8 栈，至少一帧必须落在 `@cinereel/hyper-sdk` 包根目录内

---

## 业务侧用 drive 的"正确"姿势

侧车（sidecar）和上层其它 app 的标准模式：

```ts
import { createStoreRuntime, type StoreRuntime } from '@cinereel/hyper-sdk';

// 业务侧能且只能看到这一面
const runtime: StoreRuntime = await createStoreRuntime(config.storeDir);

// 想要新 drive → 走 SDK 的 createDrive
const newDrive = await runtime.createDrive('blob', crypto.randomUUID());
// newDrive 是 Drive 类型：{ publicKey, name, type, createdAt, updatedAt }
// 注意：没有 .key Buffer、没有 hyper 实例

// 想要拿文件 → 走 FileService，接收的是 driveKey 字符串
const fileService = makeFileService(runtime as InternalStoreRuntime);
//  ↑ 这次的 cast 只在 sidecar 内部；业务上游用 FileService 接口
const tree = await fileService.getTree(newDrive.publicKey, '/');

// 远端 drive
const remote = await runtime.openDriveByKey(theirHex);
const stream = await fileService.readStream(remote.publicKey, '/file.mp4');
```

**为什么这么绕：** 拿 driveKey 字符串作为业务侧唯一标识，而不是直接传 hyper 实例？
因为拿实例 → 业务就能调 hyper 私有 API、绕过 SDK 的所有 invariant。
driveKey 是 business-friendly 的最小信息单元。

---

## 改 SDK 时去哪？

| 我想… | 打开的文件 |
| --- | --- |
| 改 drive 的存储姿势（namespace vs session） | `runtime/corestore.ts` 的 `mountByName` / `mountByKey` |
| 改 drive 列表的输出 shape | `runtime/corestore.ts` 的 `toDrive` 函数 |
| 加一个新的 drive-key 校验规则 | `utils/hyper.factory.ts` 的 `normalizeAndValidateDriveKey` |
| 改文件层接口签名 | `services/file.ts` |
| 加一个新的网络能力（比如主动 peer 搜索） | `runtime/hyperswarm.ts` 然后挂到 `services/swarm.ts` |
| 收紧 ACL | `utils/acl.ts` |
| 新增公开类型 | `types/types.ts`（慎重，公开面增长应有预算） |

详细的设计决策（"为什么 drive 必须用 namespace 不能用 key"这类问题）见
[`hyper-sdk-design.md`](./hyper-sdk-design.md)。

新增的运行时代码门禁（"为什么不让业务侧 import hyper 包"）见
[`hyper-sdk-acl.md`](./hyper-sdk-acl.md)。

