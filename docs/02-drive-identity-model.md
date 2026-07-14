# Drive 与身份模型

## 核心结论

- **一个节点** = 一套 Corestore + Hyperswarm（+ 可选多个资源 Drive）
- **主 Drive** = 该节点的 **Profile Drive**（公开身份 / 个人主页载体）
- **资源 Drive** = 业务资料库，可有多个；通过 descriptor 指向所有者的 Profile Drive
- **主 Drive ≠ 应用账号**；账号是 HTTP 层概念（见 [账号与权限](./05-accounts-permissions.md)）

## 为什么需要主 Drive

应用启动时，`HyperService` 会打开 Corestore 默认命名空间下的 Hyperdrive。在业务上应明确其职责为：

> 承载本节点对外公开的个人主页资料，并作为资源库的 `ownerProfileKey` 目标。

它 **不是**：

- 用户登录账号
- 挂载远端 Drive 的前提（订阅方只需 Corestore + Swarm + 对方 key）
- 默认往里面塞大体积媒体库的「总盘」（媒体应放在资源 Drive）

## 两类 Drive

```
节点 A
├── 主 Drive (Profile)          ← driveKey = A 的公开身份 ID
│   ├── /profile.json
│   └── /avatar.webp（示例）
│
└── 资源 Drive × N（namespace）
    ├── 电影库
    ├── 剧集库
    └── …
        └── 每个都有 /descriptor.json
            └── ownerProfileKey → 主 Drive key
```

| | 主 Drive（Profile） | 资源 Drive |
|--|---------------------|------------|
| 如何创建 | 启动时自动打开默认 namespace | `createLocalDrive(uuid)` |
| 是否出现在「发布」列表 | 否（走独立 Profile API） | 是 |
| 对外分享 | 一般不直接当「库」分享；作为身份被引用 | 分享其 `driveKey` |
| 典型内容 | 昵称、简介、头像、公开库列表 | 媒体文件与目录树 |
| DHT | 需要 announce，以便他人按 key 拉取主页 | 发布时 announce |

## 身份相关 Key 的区分

| Key | 用途 |
|-----|------|
| 主 Drive `driveKey` | P2P 公开身份 / 个人主页地址（`ownerProfileKey`） |
| 资源 Drive `driveKey` | 某个资料库的订阅地址 |
| Hyperswarm Noise keyPair | 连接层 peer 身份（限速 / 反吸血用）；**当前未与业务深度绑定** |

注意：历史上 `localPublicKey` 暴露的是主 Drive key。在 Profile 模型落地后，这与「公开身份」一致；若未来做连接级鉴权，仍应以 Swarm remotePublicKey 为准。

## 设计约束

1. 主 Drive 保持轻量，只放主页相关数据
2. 同一节点上所有新建资源库的 `ownerProfileKey` 均指向同一主 Drive key
3. 改昵称 / 头像只改主 Drive，无需改写每个资源库（除非改库名本身）
4. Hyperdrive v13 **没有** `drive.mount()`；所有者关联用 **descriptor 指针**，不是文件系统挂载
