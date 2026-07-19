# Hyperswarm 官方文档总结

> 参考：[pear-docs/content/reference/building-blocks/hyperswarm.mdx](https://github.com/holepunchto/pear-docs/blob/published/content/reference/building-blocks/hyperswarm.mdx)（hyperswarm v4.17.0）

## 一句话定位

> Hyperswarm is the high-level networking layer for discovering peers by a shared 32-byte topic and opening encrypted connections between them.

Hyperswarm 是 Holepunch 体系里的**高层网络层**：在 HyperDHT 之上做"按 32 字节 topic 找人 + 建立端到端加密连接"。

**最佳实践**：一个 app 起一个 `Hyperswarm` 实例，在同一个实例上 `join()` 多个 topic；不要每个 topic 一个 swarm。

## 安装

```sh
npm i hyperswarm
```

## 最小心智模型

```js
// 发布者：宣告 topic，等待别人来连
const server = new Hyperswarm()
server.on('connection', socket => socket.end('hello'))
const discovery = server.join(topic, { server: true, client: false })
await discovery.flushed()   // 等 DHT 宣告完

// 订阅者：查 topic，主动拨过去
const client = new Hyperswarm()
client.on('connection', socket => socket.once('data', console.log))
client.join(topic, { server: false, client: true })
await client.flush()
```

整个 Hyperswarm 的全部套路：**构造实例 → join(topic, {server/client}) → 监听 `connection` 事件拿加密 socket → 用完 destroy**。其他 API 都是这个骨架上的旋钮。

## 一、构造与状态

### `new Hyperswarm(opts = {})`

| 选项 | 作用 |
|------|------|
| `opts.keyPair` | Noise 密钥对，用于 DHT listen / connect |
| `opts.seed` | 32 字节种子，用于派生确定性密钥对（重启后身份可复现） |
| `opts.maxPeers` | 最大并发连接数，默认 `64` |
| `opts.maxClientConnections` | 最大出站连接数，默认 `Infinity` |
| `opts.maxServerConnections` | 最大入站连接数，默认 `Infinity` |
| `opts.maxParallel` | 最大并行拨号数，默认 `3` |
| `opts.firewall(remotePublicKey, payload) => boolean` | 同步过滤器，返回 `true` 即拒接；默认全放行 |
| `opts.relayThrough` | 直连打洞失败时走中继的节点公钥（或返回公钥的函数） |
| `opts.dht` | 注入已有的 hyperdht 实例（多 swarm 共享一个 DHT） |

```js
const swarm = new Hyperswarm({ maxPeers: 32 })
await swarm.listen()
```

### 状态属性

| 属性 | 类型 | 含义 |
|------|------|------|
| `swarm.connecting` | `number` | 当前还在握手的出站连接数 |
| `swarm.connections` | `Set` | 已建立的加密 duplex 连接集合 |
| `swarm.peers` | `Map<string, PeerInfo>` | 以远程 Noise 公钥 hex 为 key 的 peer 元数据 |
| `swarm.dht` | `hyperdht` | 暴露底层 hyperdht 实例，方便复用 |

## 二、Topic 成员管理（核心能力）

### `swarm.join(topic, opts)` → `PeerDiscovery`

加入一个 32 字节的 topic，**每个 topic 可独立选角色**：

| 选项 | 默认 | 作用 |
|------|------|------|
| `opts.server` | `true` | 在 DHT 上宣告，并接受别人拨进来 |
| `opts.client` | `true` | 查询 DHT，主动连发现的 server |
| `opts.limit` | `Infinity` | 本 topic 最大连接数 |

```js
const discovery = swarm.join(topic, { server: true, client: false })
await discovery.flushed()
```

**关键细节**：

- **client 模式**主动拨出去的连接，其 `peerInfo.topics` 会记录是为哪些 topic 加入的；
- **server 模式**接受进来的连接**不**绑在某个具体 topic 上（多 topic 共用一个 swarm 时这是正常的）。

### `swarm.leave(topic)`

停止该 topic 的发现与宣告。**不会**关闭已经存在的连接。

### `swarm.status(topic)` → `PeerDiscovery | null`

取出当前 topic 的 `PeerDiscovery`，未加入返回 `null`。

```js
const discovery = swarm.status(topic)
if (discovery) await discovery.refresh()
```

### `swarm.flush()`

**全局** flush：等所有待处理 DHT 宣告和连接排空。因为是 swarm 级而非 topic 级，开销相对较大。

## 三、直连 Peer（不走 topic）

并列于 topic 发现的另一条建连通道，适合"我知道对方身份但不想走 DHT 查找"的场景。

| API | 行为 |
|----|------|
| `swarm.joinPeer(noisePublicKey)` | 发起并维持对该 Noise 公钥的直接连接尝试 |
| `swarm.leavePeer(noisePublicKey)` | 停止再次尝试（已有连接不会断） |

## 四、事件

| 事件 | 回调签名 | 触发时机 |
|------|----------|----------|
| `connection` | `(socket, peerInfo)` | 每条新连接建立。**socket 已是端到端加密的双工流** |
| `update` | `()` | 内部计数器或连接状态变化（适合做监控） |
| `ban` | `(peerInfo, err)` | peer 被 ban 后（来自 firewall 返回 true 或手动 ban） |

```js
swarm.on('connection', (socket, peerInfo) => {
  console.log(peerInfo.publicKey)
  socket.write('hello')
})
```

## 五、生命周期

| API | 作用 |
|-----|------|
| `swarm.listen()` | 开始监听入站连接；首次 `join()` 通常会隐式调用，可提前 |
| `swarm.suspend({ log })` | 暂停：暂停连接、监听、发现，**不销毁**（省电 / 前后台切换） |
| `swarm.resume({ log })` | 恢复 DHT + 监听 + 发现 |
| `swarm.destroy({ force })` | 关闭监听/发现/底层 DHT；`force:true` 跳过优雅清理 |

## 六、辅助对象

### `PeerDiscovery`

| 方法 | 行为 |
|------|------|
| `flushed()` | 等本 topic 在 DHT 上宣告完成 |
| `refresh({ client, server, limit })` | 重新宣告/查询；**两个不能同时为 false**，否则抛错 |
| `destroy()` | 停掉本 topic |

### `PeerInfo`

| 成员 | 类型 | 含义 |
|------|------|------|
| `publicKey` | `Buffer` | 对方 Noise 公钥 |
| `topics` | `Buffer[]` | 本地以 client 模式加入的 topic 列表 |
| `prioritized` | `boolean` | swarm 是否仍将其视为优先连接候选 |
| `ban(banStatus)` | `boolean => void` | 手动 ban / 解 ban；**不会断已有连接** |

## 七、本质抽象（它到底提供了什么）

把 API 压成五件事：

1. **基于 32 字节 topic 的发布/订阅式发现**——同一 topic 的节点互相能找到。
2. **基于 Noise 协议的端到端加密 socket**——拿到 socket 即加密，不用自己再套一层。
3. **DHT 资源复用与连接编排**——`maxPeers / maxClient / maxServer / maxParallel` 由它在背后做连接预算。
4. **策略层**——`firewall` + `PeerInfo.ban()` 做准入控制；`relayThrough` 做 NAT 穿透兜底。
5. **生命周期管理**——`suspend/resume` 优雅做后台/前台切换或省电，`destroy` 干净退出。

## 八、在 Holepunch 生态里的位置

```
                  Hyperswarm  ← 本文档
                       │
                       ▼
                  HyperDHT    ← 更低层：DHT + 打洞
                       │
                       ▼
                Hypercore / UDP

上层常用搭配：

- Secretstream : socket 暴露的加密流类型
- Protomux     : 在一条 Hyperswarm 连接上多路复用多种协议
- Corestore    : swarm.connections 直接喂给 store.replicate()，自动副本同步
- Hyperdrive   : 基于 Hypercore + Hyperswarm 的可挂载文件系统
```

## 九、与 Cinereel 的对应

| Hyperswarm 能力 | Cinereel 中的用途 |
|-----------------|-------------------|
| `swarm.join(topic, {server})` | 资源 Drive / Profile Drive 创建后向 DHT 宣告（发布） |
| `swarm.join(topic, {client})` | 订阅时按对方 key 拨过去拉数据 |
| `swarm.connections` | 喂给 `corestore.replicate()` 做自动复制 |
| `swarm.peers` / `swarm.connecting` | 仪表盘的连接数 / peer 列表来源 |
| `swarm.firewall` | 限速 / 反吸血的准入点（见 [传输治理（规划）](./06-transport-governance.md)） |
| `PeerInfo.publicKey` | 连接层 peer 身份，与业务上的 `driveKey`（Hyperdrive 公钥）正交 |

## 参见（官方）

- [Connect to many peers by topic with Hyperswarm](https://github.com/holepunchto/pear-docs) — topic 发现的完整 walkthrough
- [HyperDHT](./02-drive-identity-model.md) — 更低层的 DHT + 打洞层
- [Secretstream](https://github.com/holepunchto/pear-docs) — socket 的加密流类型
- [Protomux](https://github.com/holepunchto/pear-docs) — 单连接多协议复用
- [Corestore](https://github.com/holepunchto/pear-docs) — 把 `swarm.connections` 直接喂给 `store.replicate()`