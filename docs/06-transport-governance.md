# 传输治理（规划）

Hyperdrive 本身 **不能** 按节点限速。传输发生在 Swarm 连接 + Corestore `replicate` 上。治理能力应挂在 `SwarmService` 的 connection 边界，而不是 Drive 读写层。

## 现有挂钩点

```ts
swarm.on('connection', (conn) => {
  store.replicate(conn)
})
```

扩展形态：

```ts
swarm.on('connection', (conn) => {
  const peerKey = conn.remotePublicKey.toString('hex')
  if (!peerPolicy.isAllowed(peerKey)) {
    conn.destroy()
    return
  }
  const stream = bandwidth.wrap(conn, peerKey)
  store.replicate(stream)
  peerMonitor.track(peerKey, conn, stream)
})
```

身份使用 Noise **`remotePublicKey`**，不要用 IP。

## 限速（Per-peer bandwidth）

| 模块 | 职责 |
|------|------|
| `BandwidthPolicy` | peerKey → `{ uploadBps, downloadBps }` |
| `SwarmService` | connection 时包装 duplex 再 replicate |

说明：

- 真正限速靠连接层 throttle（需兼容 streamx / UDX）
- Hypercore `inflightRange` 只能软性压并发，不能精确控 Bps
- 业务层选择性 download 控的是「下什么」，不是持续带宽

## 反吸血（Anti-leech）

发布 / 订阅模型下，优先解决 **未授权白嫖** 与 **异常占用**，而不是 BitTorrent 式分享率。

分层：

1. **准入**：白名单 / 订阅凭证 / 黑名单；`firewall` 或 connection 时 `destroy`
2. **行为监控**：超额下载、狂重连、占连接不干活 → 踢并拉黑
3. **配额 + 限速**：允许连但限制用量

注意：

- 当前订阅是订阅方本地行为，发布方 **没有**「已授权订阅者」列表；要做白名单需补 peer 注册或凭证交换
- discovery key 可传播，不能靠「保密 drive key」代替连接级准入

## 与业务模块边界

| 做 | 不做 |
|----|------|
| 在 SwarmModule 增加 Policy / Monitor | 在 DriveQuery/Write 里按文件限速 |
| 与账号系统可选联动（Admin 配置策略） | 把 RBAC 写进 HyperService |

## 现状评估

- **限速**：可较平滑挂到现有 `enableReplication` 单点
- **连接级踢人 / 黑名单**：同样可挂 Swarm
- **「仅授权订阅者可拉」**：连接钩子够用，但缺 peer 授权业务模型，需额外产品设计
