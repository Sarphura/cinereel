# 发布与订阅

## 发布（本地资源库）

### 业务流程

1. 用户在「发布」中创建资料库（名称 + 类型）
2. Service 用 UUID namespace 派生新的本地 Hyperdrive
3. 写入 `/descriptor.json`（约定，待落地）
4. 向 DHT announce 该 Drive
5. 将元数据写入本地 `DriveRecord`（`isLocal: true`）
6. 更新主 Drive 的 `collections`（约定，待落地）
7. 用户向库内挂载 / 上传文件

### Descriptor 约定

路径：资源 Drive 根目录 `/descriptor.json`

```json
{
  "name": "我的电影库",
  "type": "movie",
  "ownerProfileKey": "<主 Drive 的 hex key>"
}
```

| 字段 | 说明 |
|------|------|
| `name` | 库显示名；rename 时应同步改写 descriptor |
| `type` | `movie` \| `series` \| `music` \| `generic` |
| `ownerProfileKey` | 发布者 Profile Drive 的 key，供订阅方发现主页（必填） |

### 当前实现

- `DriveService.create` 在 announce 前写入 `/descriptor.json`
- rename / 类型变更会同步 descriptor
- create / rename / delete 会同步维护主 Drive `/profile.json` 中的 `collections`
- Profile 其他字段由 `GET/PATCH /api/profile` 读取和编辑

## 订阅（挂载远端资源库）

### 业务流程

1. 用户输入远端资源 Drive 的 `driveKey`
2. `SwarmService.mountRemoteDrive`：以 client 加入 discovery topic，复制数据
3. 带 wait/重试读取远端 `/descriptor.json`（必须含 `name` / `type` / `ownerProfileKey`）
4. 挂载所有者 Profile Drive，读取主页摘要
5. 持久化为 `DriveRecord`（`isLocal: false`，含 `ownerProfileKey`）

### 当前实现

- 订阅成功响应携带 `ownerProfileKey` + `owner` 摘要
- `GET /api/profile/:profileKey` 与 `GET /api/profile/:profileKey/avatar` 可读远端主页
- 缺少完整 descriptor / 无效 `ownerProfileKey` 时直接拒绝订阅（早期阶段不做降级）

### 订阅方能力边界

订阅 **不要求** 本机已有业务资源库；只需：

- Corestore（存复制数据）
- Hyperswarm（client）
- 对方资源 Drive key

主 Drive 对「纯订阅节点」不是挂载前提；但若本机也要对外展示主页，仍建议保留并维护 Profile。

## 本地元数据 vs Drive 内约定

| 数据 | 存放 | 谁消费 |
|------|------|--------|
| Drive 列表、备注、是否本地 | 本机 `DriveRecord` / JSON 仓库 | 本机 UI |
| 库名、类型、所有者指针 | 资源 Drive `/descriptor.json` | 任意订阅者 |
| 昵称、简介、头像、公开库列表 | 主 Drive `/profile.json` 等 | 任意读到 Profile 的节点 |

跨节点可见的信息必须写在 Hyperdrive 内；仅本机 UI 用的备注等可留在本地仓库。

## 类型相关的扫描规则

- **movie**：电影目录识别、海报/NFO 匹配、降级策略详见 [电影扫描规则](./08-movie-scanning.md)
- series / music / generic 类型 Drive 的目录约定与扫描规则待定
