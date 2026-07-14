# 个人主页发现

## 业务目标

用户 B 订阅（挂载）用户 A 的 **资源 Drive** 后，能够发现并查看 A 的 **个人主页**（昵称、简介、头像、公开资料库列表等）。

## 数据放在哪里

### Profile Drive（A 的主 Drive）

建议路径：

| 路径 | 内容 |
|------|------|
| `/profile.json` | 主页结构化字段 |
| `/avatar.webp`（或 `/avatar.png`） | 头像二进制 |

`/profile.json` 建议字段（与前端 `ProfileRecord` 对齐）：

```json
{
  "name": "Alice",
  "bio": "收藏向",
  "avatarPath": "/avatar.webp",
  "updatedAt": 1710000000000,
  "collections": [
    {
      "driveKey": "<资源库 key>",
      "name": "我的电影库",
      "addedAt": 1710000000000,
      "updatedAt": 1710000000000
    }
  ]
}
```

`driveKey`（Profile 自身）由读取方从已挂载的 Profile Drive 实例获取，不一定重复写进 JSON；API 层组装响应时填入。

### 资源 Drive 上的指针

```json
{
  "name": "我的电影库",
  "type": "movie",
  "ownerProfileKey": "<A 主 Drive key>"
}
```

**不是** Hyperdrive 文件系统 mount；v13 无该 API。关联关系是显式 key 引用。

## 发现链路

早期阶段约定：资源库 **必须** 带完整 `descriptor.json`（含 `ownerProfileKey`），Profile Drive **必须** 可提供 `/profile.json`。不做缺字段降级。

```
B 获得 A 的资源 driveKey
        │
        ▼
mountRemoteDrive(resourceKey)
        │
        ▼
读 /descriptor.json → 取得 ownerProfileKey
        │
        ▼
mountRemoteDrive(profileKey)   // 可缓存
        │
        ▼
读 /profile.json + 头像
        │
        ▼
UI：库浏览 + 「查看 A 的主页」
```

## 本机 Profile API

前端已调用：

- `GET /api/profile` — 当前用户主页
- `PATCH /api/profile` — 更新昵称 / 简介 / 头像

后端已对齐为读写 **本机主 Drive**，头像通过
`GET /api/profile/avatar` 提供。

远端主页：

- `GET /api/profile/:profileKey` — 按 Profile Drive key 拉取（内部 mount + 读）
- `GET /api/profile/:profileKey/avatar` — 远端头像
- 订阅成功响应内嵌 `owner` 摘要字段

## 与应用账号的关系

| | P2P Profile | 应用账号 |
|--|-------------|----------|
| 标识 | 主 Drive key | userId / session |
| 谁能看见 | 任意能连上并读到该 Drive 的节点 | 本机登录用户 |
| 用途 | 对外主页、所有者发现 | 面板权限、本机多用户 |

B 看见 A 的主页依赖 P2P Profile，**不依赖** A/B 是否实现了本机登录系统。
