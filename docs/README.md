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
| [电影扫描规则](./08-movie-scanning.md) | movie 类型 Drive 的电影目录识别、海报/NFO 匹配、降级策略 |
| [Movie 模块项目架构](./09-movie-architecture.md) | publish / subscribe 等模块改造时对照 movie 的分层约定 |
| [HyperSwarm 官方文档总结](./HyperSwarm%20%E5%AE%98%E6%96%B9%E6%96%87%E6%A1%A3%E6%80%BB%E7%BB%93.md) | Hyperswarm（v4.17.0）API 能力、与 Cinereel 现有模块的对应 |
| [调试案例索引](./cases/) | 单次排错实录：栈帧解读、定位思路、经验沉淀 |
| &nbsp;&nbsp;&nbsp;↳ [三实例 Swarm 互不可见](./cases/2026-07-19-swarm-mutual-discovery.md) | dev / peer / bootstrap 启动后谁也找不到谁：`peerCount` 永远是 `1/1/0` |
| &nbsp;&nbsp;&nbsp;↳ [TUN 代理把入站 UDP 砍掉后，Sidecar 在 DHT 里彻底失联](./cases/2026-07-19-warp-firewalled-swarm.md) | `firewalled: true` + `ephemeral: true` 的真正根因：QX / WARP / Surge / Tailscale 等 TUN 工具接管 default route |
| [Hyper SDK 设计](./hyper-sdk-design.md) | sidecar 在官方 `hyper-sdk@^6.2.2` 之上的 CSR 分层架构（`controllers/ → services/ → repositories/ + infrastructure/ + middlewares/ + bootstrap/`）、API 完整签名、决策细节、约束清单 |
| [Hyper SDK 能力地图](./hyper-sdk-capability-map.md) | drive 能力在新分层下哪些文件 / 函数里（业务侧读代码索引） |
| [Hyper SDK 访问控制](./hyper-sdk-acl.md) | CSR 重组后的边界守护：`infrastructure/sdk/index.ts` 是 src/ 下唯一允许 `import 'hyper-sdk'` 的文件 |

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
