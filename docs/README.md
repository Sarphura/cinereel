# Cinereel 业务文档

本文档描述 Cinereel 的业务模型、Drive 身份体系，以及个人主页 / 发布订阅相关约定。

## 文档索引

| 文档 | 说明 |
|------|------|
| [产品与架构概览](./01-overview.md) | 产品定位、节点模型、模块分层 |
| [Drive 与身份模型](./02-drive-identity-model.md) | 主 Drive（Profile）与资源 Drive 的职责划分 |
| [Profile Drive 结构](./profile.md) | `/profile.json`、descriptor、实现现状与类型对照 |
| [发布与订阅](./03-publish-subscribe.md) | 发布库、订阅挂载、descriptor 约定 |
| [个人主页发现](./04-profile-homepage.md) | B 挂载 A 的资源后如何看到 A 的主页 |
| [账号与权限（规划）](./05-accounts-permissions.md) | 本机多账号 RBAC，与 P2P 身份正交 |
| [传输治理（规划）](./06-transport-governance.md) | 限速、反吸血等 Swarm 层能力 |
| [落地清单](./07-implementation-checklist.md) | 按当前代码扫描得到的改动清单与顺序 |

## 术语

| 术语 | 含义 |
|------|------|
| 节点（Node） | 一台运行中的 Cinereel Service 实例，对应一套 Corestore + Hyperswarm |
| 主 Drive / Profile Drive | 节点默认 Hyperdrive，承载公开个人主页资料 |
| 资源 Drive | 通过 namespace 创建的业务资料库（电影 / 剧集 / 音乐等） |
| Drive Key | Hyperdrive 公钥（hex），对外分享与订阅标识 |
| Descriptor | 资源 Drive 根目录下的 `/descriptor.json`，描述库元数据与所有者指针 |
| Profile | 主 Drive 上的 `/profile.json` 及头像等主页内容 |
| 应用账号 | HTTP 登录用户（规划中），与 P2P Drive Key 不是同一概念 |
