# 产品与架构概览

## 产品定位

Cinereel 是基于 Hyperdrive / Hyperswarm 的本地优先媒体资料库与分发工具：

- **发布**：在本机创建资源 Drive，写入媒体文件，并向 DHT 宣告，供他人订阅
- **订阅**：凭对方 Drive Key 挂载远端 Drive，浏览 / 下载内容
- **资料库展示**：按类型（电影 / 剧集 / 音乐）浏览已整理内容
- **个人主页（规划落地中）**：订阅者可通过资源库发现发布者的公开主页

## 运行形态

当前为 **单节点本地服务**：

```
apps/web  ──HTTP──►  apps/service  ──P2P──►  其他节点
                         │
                    Corestore / Hyperdrive / Hyperswarm
```

- Service：NestJS + Fastify，负责 Drive 读写、发布订阅、下载任务
- Web：面板 UI（仪表盘、资料库、下载、订阅、发布、个人资料）

## 分层职责（Service）

| 层 | 模块 | 职责 |
|----|------|------|
| 基础设施 | `HyperModule` | Corestore / 主 Hyperdrive / Hyperswarm 生命周期 |
| 网络 | `SwarmModule` | 复制绑定、DHT 宣告、远端 Drive 挂载 |
| 原语 | `DriveBaseModule` | Hyperdrive 读写（query / write） |
| 业务 | `Publish` / `Subscribe` / `Download` | 本地库、订阅、下载任务 |

原则：

- Drive 读写层不感知账号与限速
- P2P 策略（限速、准入）落在 Swarm 边界
- 应用账号与权限落在 HTTP 边界（规划）

## 关键概念对应

| 用户感知 | 技术实体 |
|----------|----------|
| 我的电脑上的 Cinereel | 一个节点（一个 Corestore） |
| 我的个人主页 | 主 Drive（Profile Drive） |
| 我的电影库 / 剧集库 | 资源 Drive（namespaced） |
| 别人分享给我的链接 | 资源 Drive 的 `driveKey` |
| 点开对方主页 | 经 descriptor 的 `ownerProfileKey` 找到对方主 Drive |

## 当前能力边界

已具备：

- 多本地资源 Drive 创建 / 宣告
- 远端挂载与订阅元数据
- 下载任务队列
- Profile API 与前端个人资料页（主 Drive 读写及头像）
- 资源 Drive 写入带 `ownerProfileKey` 的 descriptor
- 订阅时解析 owner 并挂载 Profile Drive

尚未具备或仅部分具备：

- 前端展示对方主页入口
- 本机多账号与面板权限
- Per-peer 限速与反吸血
