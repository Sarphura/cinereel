# Profile Drive

本文描述当前 Cinereel 的 Profile Drive 结构、与资源 Drive 的关系，以及代码约定。

权威类型定义见：

`apps/service/src/modules/common/domain/drive-manifest.ts`

## 定位

| 概念 | 对应 |
|------|------|
| Profile Drive | 节点启动时打开的 **主 Hyperdrive**（`HyperService.drive`） |
| 身份标识 | 主 Drive 的 `driveKey`（hex 公钥） |
| 职责 | 公开个人主页：昵称、简介、头像、公开资源库列表 |
| 非职责 | 大体积媒体库、本机登录账号 |

一个节点一个 Profile Drive。资源库可以有多个，都通过 `ownerProfileKey` 指向它。

```
节点
├── Profile Drive（主 Drive）
│   ├── /profile.json
│   └── /avatar.webp（可选）
│
└── 资源 Drive × N
    └── /descriptor.json
        └── ownerProfileKey → Profile Drive key
```

## Drive 内文件结构

### `/profile.json`（`PROFILE_DOCUMENT_PATH`）

持久化文档类型：`ProfileDocument`

```json
{
  "name": "Alice",
  "bio": "收藏向",
  "avatarPath": "/avatar.webp",
  "updatedAt": 1710000000000,
  "collections": [
    {
      "driveKey": "<资源库 hex key>",
      "name": "我的电影库",
      "addedAt": 1710000000000,
      "updatedAt": 1710000000000
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 显示名 |
| `bio` | `string` | 简介 |
| `avatarPath` | `string \| null` | Drive 内头像路径；无头像为 `null` |
| `updatedAt` | `number` | 毫秒时间戳 |
| `collections` | `ProfileCollection[]` | 公开资源库索引 |

**不写入 `/profile.json` 的字段：**

| 字段 | 原因 |
|------|------|
| `driveKey` | 即本 Drive 的公钥，由 Hyperdrive 实例 / API 补充 |
| `avatarUrl` | HTTP URL 依赖本机端口与路由，由 API 层生成 |

前端完整响应对齐 `ProfileRecord`：

```ts
{
  driveKey,      // API 补充
  name, bio, avatarPath, updatedAt, collections,
  avatarUrl,     // API 补充
}
```

### 头像文件

约定路径示例：`/avatar.webp` 或 `/avatar.png`。

- Drive 内只存二进制文件 + `avatarPath` 指向它
- 订阅方按路径从 Profile Drive 读取
- 本机 UI 通过 service 生成的 `avatarUrl` 访问

### 资源 Drive：`/descriptor.json`（`DRIVE_DESCRIPTOR_PATH`）

类型：`DriveDescriptor`

```json
{
  "name": "我的电影库",
  "type": "movie",
  "ownerProfileKey": "<Profile Drive hex key>"
}
```

| 字段 | 说明 |
|------|------|
| `name` | 库显示名 |
| `type` | `movie` \| `series` \| `music` \| `generic` |
| `ownerProfileKey` | 所有者 Profile Drive key（必填） |

关联是 **key 引用**，不是 Hyperdrive `mount()`（v13 无此 API）。

## 发现链路

```
订阅资源 driveKey
  → mount 资源 Drive
  → 读 /descriptor.json → ownerProfileKey
  → mount Profile Drive
  → 读 /profile.json（+ 头像）
  → 展示主页 / collections
```

早期阶段要求资源库与 Profile 均按完整约定写入；不做缺字段降级。

## 当前实现状态

### 已落地

`DriveService`（`apps/service/src/modules/publish/service/drive.service.ts`）：

| 操作 | 行为 |
|------|------|
| 创建资源库 | 写资源 `/descriptor.json`；在主盘 `/profile.json` upsert `collections`；再 announce |
| 重命名 / 改类型 | 同步改写 descriptor，并更新 collection 名称 |
| 删除资源库 | 从 Profile `collections` 移除对应项 |

本地元数据 `DriveRecord` / `DriveResponseDto` 可选字段 `ownerProfileKey` 已在创建时写入。

`ProfileModule`（`apps/service/src/modules/profile`）：

| API / 行为 | 说明 |
|------------|------|
| 启动初始化 | 主 Drive 缺少 `/profile.json` 时写入空文档 |
| `GET /api/profile` | 返回主页，并补充 `driveKey` / `avatarUrl` |
| `PATCH /api/profile` | 更新名称、简介及头像，保留 collections |
| `GET /api/profile/avatar` | 从主 Drive 返回 PNG / JPEG / WebP 头像 |
| `GET /api/profile/:profileKey` | 按 key 读取本机或远端主页 |
| `GET /api/profile/:profileKey/avatar` | 按 key 读取本机或远端头像 |

头像通过 `avatarDataUrl` 写入，限制 5 MB；替换格式或删除头像时会清理旧文件。

`SubscribeService`：订阅资源库时解析 `ownerProfileKey`，挂载 Profile，并在响应中返回 `owner` 摘要。

### 未落地

| 项 | 说明 |
|----|------|
| 前端 owner 入口 / 远端主页页 | 后端数据已就绪，UI 待接 |

## 相关代码

| 位置 | 内容 |
|------|------|
| `modules/common/domain/drive-manifest.ts` | 路径常量与 schema |
| `modules/publish/service/drive.service.ts` | descriptor / collections 维护 |
| `modules/profile` | Profile API、头像与主盘文档初始化 |
| `modules/subscribe` | 订阅资源库并解析 owner Profile |
| `modules/base/hyper/hyper.service.ts` | 主 Drive 生命周期 |
| `apps/web/src/features/profile/types.ts` | 前端 `ProfileRecord` |

## 相关文档

- [Drive 与身份模型](./02-drive-identity-model.md)
- [发布与订阅](./03-publish-subscribe.md)
- [个人主页发现](./04-profile-homepage.md)
- [落地清单](./07-implementation-checklist.md)
