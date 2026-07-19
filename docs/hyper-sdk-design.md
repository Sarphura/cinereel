# Hyper SDK Design

## 1. 架构设计

### 1.1 定位与目标

`@cinereel/hyper-sdk` 是 Hyper 分布式存储系统的 TypeScript 封装层。它：

- **负责**：Hyperdrive/Corestore/Hyperswarm 的生命周期管理、API 适配、错误抽象
- **不负责**：业务层元数据（drive 名称、类型、创建时间）、持久化索引、权限控制

分层职责：

```
┌──────────────────────────────────────────────────────────────┐
│  Consumer (Sidecar / 其他上层应用)                           │
│  - 业务层元数据管理（drive-index.json）                        │
│  - HTTP 路由 / 认证 / 请求校验                               │
└────────────────────────────┬─────────────────────────────────┘
                             │  Hyper SDK API
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  @cinereel/hyper-sdk                                        │
│  - Corestore 多租户 namespace 管理                          │
│  - Hyperdrive CRUD 与文件操作                                 │
│  - Hyperswarm P2P 发现与复制                                │
│  - Hyper v13 API 适配与错误抽象                              │
└────────────────────────────┬─────────────────────────────────┘
                             │  Corestore / Hyperdrive / Hyperswarm
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Hyper 底层库                                               │
│  - hyperdrive v13.3.2                                       │
│  - corestore v7                                            │
│  - hyperswarm                                              │
│  - hypercore / rocksdb-native                              │
└──────────────────────────────────────────────────────────────┘
```



### 1.2 核心设计决策



#### 决策：每个 Drive 使用 UUID 作为 Corestore Namespace

```
storeDir/
├── db/
│   ├── 000008.sst   ← Hypercore #1 (namespace 'main')
│   ├── 000021.sst   ← Hypercore #2 (namespace '<uuid>')
│   └── ...
└── drive-index.json  ← 业务元数据（由 sidecar 管理，不在此 SDK 中）
```

- **UUID 生成**：`crypto.randomUUID()`，保证跨重启的存储连续性
- **固定 namespace**：`'main'` 用于主 drive
- **Why not 用 driveKey 作为 namespace**：key 是公钥，namespace 是存储隔离机制，分离更清晰
- **Why not 用 name 作为 namespace**：name 是业务层概念，存储层不应依赖业务语义



#### 决策：业务层元数据（name、createdAt）不进入 SDK

- Corestore/Hyperdrive 是存储引擎，无业务语义
- `DriveDescriptor.name`、`DriveDescriptor.createdAt` 等字段由 sidecar 层注入
- SDK 的 `listDrives()` 仅返回 `{ uuid, driveKey, type }`



#### 决策：Remote Drive 用 `session() + key` 模式打开

```ts
// ✅ 正确：session() + explicit key buffer
const drive = new Hyperdrive(store.session(), Buffer.from(hexKey, 'hex'));

// ❌ 错误：namespace 模式会忽略 key，生成随机 key
const drive = new Hyperdrive(store.namespace(`remote:${hexKey}`));
```

---



## 2. API 能力



### 2.1 类型系统

```ts
// Drive 类型
type DriveType = 'metadata' | 'blob';

// Drive 描述符（业务层，由 sidecar 注入）
interface DriveDescriptor {
  driveKey: string;   // 64-char hex，公钥
  name: string;       // 业务名称
  type: DriveType;    // 类型
  isLocal: boolean;
  createdAt?: string; // ISO 8601
}

// 文件条目
interface HyperdriveEntry {
  key: string;        // 路径
  seq: number;
  value: {
    type: 'file' | 'directory';
    metadata: unknown;
  } | null;
}

// 目录树节点
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  children?: TreeNode[];
}

// 对等节点信息
interface PeerInfo {
  publicKey: string;
  connectedAt: string;
}

// 节点身份信息
interface IdentityInfo {
  mainDriveKey: string;
  swarmPort: number;
  peerCount: number;
}
```

---



## 3. 接口设计



### 3.1 CorestoreRuntime

管理 Corestore 实例和所有 Hyperdrive 的生命周期。

```ts
export interface CorestoreRuntime {
  /** 单例 Corestore 实例 */
  store: CorestoreInstance;

  /** 主 Drive（namespace 'main'）*/
  main: HyperdriveInstance;

  /**
   * 创建新 Drive。
   * - 生成随机 UUID 作为 Corestore namespace
   * - 返回 { driveKey, uuid, type }
   * - 重启后可用相同 UUID 重新打开
   */
  createDrive(type: DriveType): Promise<CreatedDrive>;

  /**
   * 用指定 UUID 挂载已有 Drive。
   * - 用于启动恢复：用 drive-index 中的 UUID 重新挂载
   * - 若已挂载则返回现有实例
   */
  mountDrive(uuid: string, type: DriveType): Promise<HyperdriveInstance>;

  /**
   * 挂载或创建（用于恢复场景）。
   * - 优先挂载已有存储
   * - 若 namespace 无数据则创建空 Drive
   */
  mountOrCreate(uuid: string, type: DriveType): Promise<HyperdriveInstance>;

  /**
   * 查询已挂载 Drive。
   * - 返回 null 表示未挂载（不等于不存在）
   */
  getDrive(uuid: string): HyperdriveInstance | null;

  /**
   * 用公钥解析 Remote Drive。
   * - 优先从已挂载列表查找（O(1)）
   * - 未挂载时通过 `store.session() + key buffer` 打开
   * - 验证 key 格式（64-char hex）
   */
  resolveByKey(driveKey: string): Promise<HyperdriveInstance>;

  /**
   * 列出所有已挂载 Drive（不含业务字段）。
   */
  listDrives(): DriveInfo[];

  close(): Promise<void>;
}
```

**关键实现细节**：

- `named: Map<uuid, NamedDrive>` — 追踪所有已挂载 Drive
- `byKey: Map<hexKey, Drive>` — DriveKey → Drive 快速查找
- 每个 Drive 必须有唯一 namespace：`new Hyperdrive(store.namespace(uuid))`
- Remote Drive：`new Hyperdrive(store.session(), keyBuffer)`



### 3.2 FileService

文件级 CRUD 操作，所有接口以 `driveKey` 定位 Drive。

```ts
export interface FileService {
  /** 获取文件/目录元数据 */
  getEntry(driveKey: string, path: string, wait?: boolean): Promise<HyperdriveEntry | null>;

  /** 获取目录树（扁平化为一层子节点）*/
  getTree(driveKey: string, prefix?: string, wait?: boolean): Promise<TreeNode>;

  /** 读取文件内容（流式）*/
  readStream(driveKey: string, path: string, wait?: boolean): Promise<Readable>;

  /** 写入文件内容（原子性，writeStream → finish）*/
  write(driveKey: string, path: string, body: Buffer, metadata?: unknown): Promise<{ ok: true; byteLength: number }>;

  /** 删除文件/目录（recursive=true 递归删除）*/
  deleteEntry(driveKey: string, path: string, recursive?: boolean): Promise<{ ok: true }>;
}
```

**Hyperdrive v13 适配层**：

- v13 所有操作返回 `Promise` 或 `Readable`（无回调）
- `adaptEntry()` 将 v13 内部结构 `{ key, seq, value: { blob, metadata } }` 映射到 `HyperdriveEntry`
- `blob === null` → directory；否则 → file
- `write` 使用 `createWriteStream`，通过 `finish` 事件确认写入完成



### 3.3 SwarmService

P2P 网络层：发现、连接、广播。

```ts
export interface SwarmService {
  /** 将主 Drive 广播到网络 */
  announce(flush?: boolean): Promise<void>;

  /** 获取当前连接的 Peer 列表 */
  getPeers(): PeerInfo[];

  /**
   * 订阅远程 Drive（通过公钥）。
   * - 调用 resolveByKey 打开 Drive
   * - 自动 join Hyperswarm DHT 发现
   */
  mount(publicKey: string): Promise<{ driveKey: string }>;

  /** 取消订阅远程 Drive */
  unmount(publicKey: string): Promise<void>;

  /** 获取本节点身份信息 */
  identity(): IdentityInfo;
}
```



### 3.4 HyperswarmRuntime

Hyperswarm 封装，底层 DHT 网络操作。

```ts
export interface HyperswarmRuntime {
  swarm: Hyperswarm;
  join(drive: HyperdriveInstance, flush?: boolean): Promise<void>;
  leave(drive: HyperdriveInstance): Promise<void>;
  destroy(): Promise<void>;
}
```

---



## 4. 能力实现细节



### 4.1 多租户存储隔离

Corestore 的 `namespace()` 是隔离单元。每个 Drive 对应一个独立的 namespace：

```ts
// 本地 Drive（使用 namespace）
const ns = store.namespace(uuid);
const drive = new Hyperdrive(ns);

// Remote Drive（使用 session + key）
const session = store.session();
const drive = new Hyperdrive(session, keyBuffer);
```

**不可混用**：同一 Corestore 实例不能对两个 Drive 使用相同的 namespace，否则第二个 `drive.ready()` 会永久阻塞。

### 4.2 启动恢复流程

```
启动时：
1. 读取 drive-index.json → { uuid: { name, type, createdAt } }
2. 对每个 uuid（非 main）：
   - runtime.getDrive(uuid) → 检查是否已挂载
   - 若未挂载：runtime.mountOrCreate(uuid, entry.type)
3. 重建 keyToUuid 反查表
4. 所有 Drive 可用，list() 返回完整信息
```



### 4.3 Remote Drive 打开约束

Hyperdrive v13 对构造函数参数有严格约束：


| 调用方式                                              | 行为                          |
| ------------------------------------------------- | --------------------------- |
| `new Hyperdrive(store.namespace('x'))`            | 打开/创建 namespace 'x' 的 Drive |
| `new Hyperdrive(store.session(), keyBuffer)`      | 打开已知公钥的 Remote Drive        |
| `new Hyperdrive(store.session())`                 | 生成新随机 Drive（错误）             |
| `new Hyperdrive(store.namespace('x'), keyBuffer)` | key 被忽略（opts vs positional） |


SDK 在 `resolveByKey()` 中强制使用正确的 `session() + key` 模式。

### 4.4 文件路径规范化

所有路径在传入 Hyperdrive 前规范化：

```ts
function normalizePath(p: string): string {
  if (!p || p === '/') return '/';
  return '/' + p.replace(/^\/+/, '');
}
```



### 4.5 错误处理

SDK 定义两类业务错误：

```ts
class InvalidDriveKeyError extends Error {
  provided: string; // 出错的 key
}

class InvalidPublicKeyError extends Error {
  provided: string; // 出错的公钥
}
```

其他错误直接透传底层 Hyper 库的错误。

---



## 5. 文件结构

```
packages/hyper-sdk/src/
├── index.ts                    ← 统一导出
├── types/types.ts              ← 共享类型定义
├── runtime/
│   ├── corestore.ts            ← 存储运行时（核心）
│   └── hyperswarm.ts           ← P2P 网络运行时
├── services/
│   ├── drive.ts                ← Drive 工厂（@deprecated）
│   ├── file.ts                 ← 文件操作服务
│   └── swarm.ts               ← Swarm 服务
├── utils/
│   └── hyperdrive.factory.ts  ← Drive 解析工具
└── hyper-sdk.d.ts              ← 第三方库类型声明
```

---



## 6. 已知约束


| 约束                                    | 说明                            |
| ------------------------------------- | ----------------------------- |
| 每个 Corestore 只支持一个 `namespace()` 别名   | 重复 namespace 会导致 `ready()` 挂起 |
| `key` 必须作为构造函数第二个位置参数传入               | 放入 `opts.key` 会被忽略            |
| v13 `writeStream` 需监听 `finish` 事件确认完成 | `close` 事件不可靠                 |
| v13 无原生递归删除                           | 需手动遍历子树逐个删除                   |
| 业务层元数据不由 SDK 管理                       | 必须由上层（sidecar）单独持久化           |


