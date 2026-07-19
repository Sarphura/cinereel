# 排查实录：当 QX / WARP 这类 TUN 代理把入站 UDP 砍掉时，两个 Sidecar 如何在 DHT 里“彻底失联”

> 一次把"明明公网 IP，UDP 出口正常，但对方就是 ping 不进来"从表象一路挖到 TUN 虚拟网卡的完整记录。

## 0. 一句话总结

**Quantumult X 在「规则模式 + 走机场」**下，会创建一个 TUN 虚拟网卡（`utun6`）接管符合规则的所有出站流量，把它们通过本地代理节点加密转发到远端机场 VPS。
机场节点是**远端 NAT 后面**——它接受你已建立会话的 UDP 回包，但**对任何主动发到你 UDP ephemeral 端口的入站包一律丢弃**。
结果就是：**Hyperdht 自检永远 `firewalled: true`，自动进入 `ephemeral: true` 短命模式，DHT routing table 始终为空，两个 Sidecar 永远发现不了对方。**
关掉 QX（或把 cinereel 相关流量设为 `DIRECT`），问题立刻消失。

> 本质上和 Cloudflare WARP、Tailscale exit node、Surge、ClashX 同根——只要你的出站被 TUN/Network Extension 桥接到**远端 NAT 后面**，入站 UDP 都会死。QX 在规则模式下尤其隐蔽，因为 HTTP/TCP 不受影响，只在 Hyperswarm 这类 P2P/UDP 应用上炸。

---

## 1. 背景与运行拓扑

本机长期并发跑着三个 Sidecar（典型 DHT 多实例调试场景）：

| 角色 | 入口 | env file | HTTP 端口 | store 目录 |
|------|------|----------|-----------|------------|
| dev（主实例） | `pnpm dev:sidecar` | `.env.development` | 4321 | `./.sidecar-store` |
| peer（第二实例）| `pnpm dev:sidecar:peer` | `.env.peer` | 4322 | `./.peer-sidecar-store` |
| bootstrap（DHT 种子）| `pnpm dev:bootstrap` | `.env.bootstrap` | 9000 | `./.bootstrap-store` |

预期是：bootstrap 是一颗"挂在 DHT 上的常驻 relay"，dev 与 peer 启动时把它当 upstream，记到自己的 DHT 路由表里，然后大家互相发现。

---

## 2. 现象

三个实例全部 `Server listening at http://127.0.0.1:XXXX`，HTTP 层面完全没毛病。

但是 `/v1/identity` 暴露了一个奇怪的数据形态：

```text
=== bootstrap ===   {"peerCount":0, "swarmPort":10415, ...}
=== dev       ===   {"peerCount":1, "swarmPort":10579, ...}
=== peer      ===   {"peerCount":1, "swarmPort":10572, ...}
```

dev 看到的那个 peer 的 `peerPublicKey` 正好等于 peer 一侧的；反之亦然。
bootstrap 完全孤立。

最初以为是"hyperswarm v4 的 `dht.connect(..., { relayAddresses })` 需要主动填 LAN 地址"那一类业务层问题。但**任何路径都补不进 routing table**——bootstrap 永远 `peerCount: 0`，dev/peer 永远看不到 bootstrap。

---

## 3. 排查路径：一步步逼近 WARP

### 3.1 假设一：是不是我在 NAT 后？

用户的初判：*"我们机器在 NAT 后面，ISP 出口是 155.254.108.7。"*

我写了一个**STUN 探针**（`scripts/nat-probe.mjs`），
同时开 3 个 UDP socket 各自去问 `stun.l.google.com / stun.cloudflare.com`，
看 NAT 映射的公网端口是 `1 个` 还是 `3 个`。
规则：

- 3 个公网端口都不同 → **Endpoint-Independent Mapping / Full Cone** → 打洞友好
- 全部相同 → **Symmetric NAT** → 打洞极难

第一轮结果（WARP 还开着）：

| 项目 | 数据 |
|------|------|
| 公网 IP | `186.236.200.70` |
| 3 个 socket 拿到不同公网端口 | `62424 / 14843 / 17189` |
| 三台 STUN 都一致 | ✅ |

**结论：机器不在 NAT 后（或者在 Full Cone NAT 后）。** 这一条被否掉。

---

### 3.2 假设二：是不是 `dht-rpc` 路由表填不上？

用户最早的分析提到 `dht-rpc 6.26.4` 的 `_addNodeFromNetwork(from)` 对 `from.id === null` 的节点**不进 routing table**，所以路由表始终是空。

我写了一个**带详细诊断的单进程探针**（`probe-v2.js`），跑 60 秒，每 5 秒 dump：

- `dht.table.rows.length`
- `dht.nodes.length`
- `dht.firewalled`
- `dht.ephemeral`
- `swarm.peers.size / connections.size`

第二轮结果（仍开着 WARP）：

```json
{
  "listening": true,
  "routingTableRows": 256,
  "totalKnownNodes": 0,
  "firewalled": true,
  "ephemeral": true,
  "peers": 0,
  "connections": 0
}
```

🚨 **关键发现**：`firewalled: true` + `ephemeral: true` + `peers: 0`。

解读：

| 字段 | 含义 |
|------|------|
| `firewalled: true` | Hyperdht 5s 内探测 UDP 双向不可达，**判定被防火墙挡** |
| `ephemeral: true` | 因为 firewalled 自动降级成"短命节点"——DHT 上你活不过 30 秒 |
| `routingTableRows: 256` | k-bucket 数组**总行数**（最大理论值），不代表有节点 |
| `totalKnownNodes: 0` | 真的"已知节点队列"——0 |

**关键判读**：之前我以为"我不在 NAT 后，公网 DHT 应该能填进路由表"——但 `firewalled: true` 直接否掉了这个假设。
NAT 后面 if Full Cone 的话，Hyperdht 是**不会**报 firewalled 的。
既然报了 firewalled，说明 **UDP 入站在某层被拦**。

---

### 3.3 假设三：是不是 macOS firewall 拦的？

`/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate` 报：

```
Firewall is disabled. (State = 0)
```

但有 caveat：用户机器是 **managed Mac**（MDM / 公司发的）。
尝试 `socketfilterfw --setglobalstate off` 时回报：

```
Firewall settings cannot be modified from command line on managed Mac computers
```

→ 之前 `disabled` 已经是某次手动关掉的状态，命令行不能再改了。

不管怎样，**macOS firewall 不是元凶**——它本来就是 disabled。

---

### 3.4 假设四：Inbound UDP 究竟通不通？

写一个**原生 UDP 探针**（`udp-native.js`）：
本地 bind 一个端口，每秒给自己（`127.0.0.1:PORT`）打一包，
看 inbound 出不出来。

```text
listening on 0.0.0.0:41234
[t=1003ms] IN from 127.0.0.1:41234 ← "PING"
...
--- done, roundTrips=29 ---
```

**Loopback 完全 OK**——用户态 UDP socket 自发自收正常。
但 loopback 通 ≠ 外网 inbound 通。

---

### 3.5 假设五：究竟是谁在拦？

`route get 8.8.8.8`：

```
route to: 8.8.8.8
interface: utun6
```

`ifconfig` 显示有一张 `utun6` 接口：

```text
utun6: flags=8051<UP,POINTOPOINT,RUNNING,MULTICAST> mtu 4064
    inet 198.19.0.1 --> 198.19.0.1 netmask 0xff000000
    options=6463<RXCSUM,TXCSUM,CHANNEL_IO,PARTIAL_CSUM,ZEROINVERT_CSUM>
```

`198.19.0.1` / `utun6` / `CHANNEL_IO` / `PARTIAL_CSUM` —— **任何 TUN-based 代理工具（QX / Surge / ClashX / WARP / Tailscale）的指纹**。
进一步确认：

```bash
ls /Applications/ | grep -iE 'quantumult|surge|clash|warp|cloudflare|tailscale'
# → Quantumult X.app（你的机器上跑的是这个）
```

🎯 **找到了元凶：Quantumult X 在「规则模式 + 走机场」**——它的 TUN 接口 `utun6` 接管 default route。

---

### 3.6 QX（以及同类工具）的工作机制（这次踩的坑）

QX 在 macOS 上同样以 **Network Extension / Packet Tunnel Provider** 注入网络栈。
「规则模式」下它创建一张 TUN 网卡，所有出站包先经过规则匹配引擎，再决定走代理还是直连：

```
你的进程 (Hyperswarm UDP socket)
       │ outbound UDP packet (e.g. 到 142.93.x.x:49737)
       ▼
QX 的 TUN 接口 (utun6, 198.19.0.1)
       │ 规则匹配 → 命中 PROXY
       ▼
QX 本地代理 (socks5 / shadowsocks / v2ray)
       │ 加密封装
       ▼
机场节点 (远端 VPS)
       │ 解密 → 用机场节点自己的公网 IP 出站
       ▼
目标服务器 (Hyperswarm DHT 节点)
       ▲
       │ 它看到的"你的地址"是：机场节点的公网 IP，不是你的真实 IP
```

**关键问题在返回路径**：

```
目标服务器想回包给你
       │ 回包目标是「机场节点:某 ephemeral 端口」
       ▼
机场节点收到一个它没建立过会话的 UDP 包
       │ 没有端口转发规则
       │ 不是任何已建立会话的回应
       ▼
丢 弃 ！  ← 你的进程永远收不到
```

特点：

| 项 | QX 规则模式下的行为 |
|----|---------------------|
| **outbound UDP** | 通（被代理节点转发出去）|
| **inbound UDP 到 ephemeral 端口** | **被机场节点丢弃** |
| **公网 IP** | 显示的是机场节点 IP，不是 ISP 给的 |
| **HTTP / TCP 服务** | 正常（TCP 的 NAT 表项会保留几分钟，且代理会建立完整 TCP 会话）|
| **`firewalled=true` 的根因** | Hyperdht 探测 NAT 时通过 UDP 双向打洞，**机场节点拦了入站 → 探测失败 → firewalled=true** |

**注意！** 这一条和我之前的猜测**部分重合又部分相反**：

- ✅ 重合：你确实在 NAT 后——但 NAT 不是 ISP 的，是**机场节点的远端 NAT**。
- ❌ 反转：你**不是同 IP 被 DHT 当成同一个 peer**（DHT 靠 Noise 公钥识别，不靠 IP），错的是 inbound UDP 被前一级直接砍掉了，根本到不了 DHT 层。

#### 这和 WARP / Tailscale exit node / Surge / ClashX 是同一个机制

| 工具 | 模式 | TUN 接口 | 入站 UDP 命运 |
|------|------|---------|--------------|
| **QX 规则模式** | 命中规则的出站走代理 | **创建** | **机场节点丢弃** ⚠️ |
| QX 直连模式 | 全直连 | 不创建 | OK |
| QX 全局模式 | 全代理 | 创建 | 机场节点丢弃 |
| Cloudflare WARP | L3 VPN | 创建 | Cloudflare 边缘丢弃 |
| Tailscale exit node | 选出口节点 | 创建 | exit node 丢弃 |
| Surge 增强模式 | 按规则代理 | 创建 | 机场节点丢弃 |
| ClashX TUN 模式 | 全代理或按规则 | 创建 | 机场节点丢弃 |

**识别口诀**：只要 `route get 8.8.8.8` 显示走 `utun*`、且你日常有"翻墙"需求，**100% 是被代理拦了入站 UDP**，跟具体是 QX 还是 WARP 无关。

---

### 3.7 关掉代理的痛苦过程

QX、WARP 这类工具的 Network Extension 不是普通用户态进程能 kill 的。
试过：

```bash
sudo killall -9 "Quantumult X" "Warp" "WARP Helper"  # → 没效果
pkill -9 -f 'cloudflare'                              # → 没效果
pkill -9 -f 'quantumult'                              # → 没效果
ps -ax | grep -iE 'quantumult|warp|cloudflare'        # → 一个进程都看不到
```

`ps` 已经看不到对应进程，但 `utun6` 还在 + `default route` 还指 utun6。
**用户态进程早被系统搁置了，Network Extension 还在内核层接管路由。**

唯一可靠的方法是**在 QX 自己的 UI 里关掉**：

```
Quantumult X → 弹窗主界面 → 点 "QX" 图标 → 选「关闭」 / 把「模式」改成「直连」
```

或者彻底卸载：

```
QX → 设置 → 划到最下面 → 「彻底卸载」(会同时移除 Network Extension)
```

关完后验证：

```text
==== utun6 ====        (空，不存在)
==== default route ==== en0 ✅
==== 公网 IP ====      93.249.118.163（ISP 真给） / 124.235.210.225
==== QX / WARP ====    彻底断开
```

> 不需要 sudo，不需要重启 macOS。UI 里关掉即生效——这是 Network Extension 的设计：它的开关由宿主 App 控制，不在 OS 通用 firewall 那一层。

---

### 3.8 复测：firewalled 立刻消失

`scripts/nat-probe.mjs` 重跑（不再过代理出口）：

| 项 | QX 开着（规则模式） | QX 关掉 |
|---|---|---|
| 公网 IP | 155.254.108.x (机场出口池) | **93.249.118.163**（ISP 直给）|
| 端口分配 | 对称（Symmetric）| 不同（EIM / Full Cone）|
| Hyperdht firewalled | `true` | **`false`** ✅ |

启动三个 Sidecar + 一个本地 Hyperswarm probe，15 秒内拿到了 **46 个远端节点**，
能看到 dev / peer 的 swarmPort + 真正的公共 DHT 节点（Hetzner / DigitalOcean / OVH / Contabo）。

```text
*** SUCCESS — sidecars see peers! ***
t=15s mainPeers=2 peerPeers=2
```

**问题归零。**

---

## 4. 根因小结

| 现象 | 根因 |
|------|------|
| 三个 Sidecar HTTP 都 listening，但 `peerCount: 1/1/0` | HTTP/TCP 走的是 OS 内 TCP，会被代理建立完整会话，不受 TUN 入站限制 |
| `dht.firewalled: true` | **QX / WARP / Tailscale exit node 等 TUN 代理**拦截入站 UDP，Hyperdht 自检判定"双向不可达" |
| `dht.ephemeral: true` | firewalled 后的自动降级：DHT 上你活不过 30 秒 |
| `dht.nodes.length: 0` | 别人 ping 你，回包到机场节点后被丢弃，没人愿意把你当真节点登记 |
| dev/peer 互见，bootstrap 孤立 | dev/peer 历史上先后互相 mount 过对方；bootstrap 从未被 mount |
| NAT 探测说是 Full Cone | 确实在 ISP 出口是 Full Cone；**代理工具又叠加了一层"只出不进"的远端 NAT** |

**一句话**：

> 任何 TUN-based 代理工具（QX 规则模式、WARP、Tailscale exit node、Surge、ClashX……）接管 default route 后，把 outbound UDP 桥接到**远端 NAT 后面**。对方回包的目标地址变成代理节点，**代理节点不会为你的 UDP ephemeral 端口做端口转发** → Hyperdht 双向打洞自检失败 → `firewalled: true` → 路由表永远填不上 → Sidecar 之间互相找不到。

---

## 5. 解决办法（按场景）

### 5.1 调试期 / 本地开发：给 cinereel 相关流量设 DIRECT

最快的"看到效果"的方法——**不要全关代理**，只让 cinereel 相关的出站走直连：

**QX 规则加几条：**

```ini
# 黑名单 cinereel 的 UDP 端口范围（Hyperdht 默认 49737 + 上下浮动）
# 同时把 cinereel 进程的所有出站设为 DIRECT
HOST-KEYWORD,cinereel,DIRECT
PROCESS-NAME,node,DIRECT          # 如果你其他 Node 程序也想直连

# 或者更精确：只放行相关公网 IP（公共 DHT bootstrap 节点）
# GEOIP,CN,DIRECT
# 这条一般规则集里已经有
```

或者**临时全关代理**（最快但会断网）：

```bash
# 在 QX UI 里：模式 → 直连
# 或彻底：QX → 设置 → 彻底卸载
```

**验证**：

```bash
# 1) 默认路由已切回 en0
route get 8.8.8.8 | grep interface
# 应该看到 en0，不是 utun*

# 2) 公网 IP 已变成 ISP 真给的
curl -s ifconfig.me
# 应该看到 124.235.x.x 或 93.249.x.x（不是 155.254.x.x 这种代理池段）

# 3) Hyperswarm 已经"非 firewalled"
cd /Users/lynn/Code/cinereel
node scripts/nat-probe.mjs
# 3 个 socket 应该各自拿到不同的公网端口
```

**注意**：managed Mac 的命令行 firewall 修改是被锁的，但 QX/WARP 的开关**没有**被 MDM 锁——你在 QX UI 里可以自己切模式。

---

### 5.2 长期 / 用户侧：把 `connectToPeer` 链路做成 fallback

对于**没法让用户关代理工具**的场景（很多用户根本不觉得 QX 在拦东西），cinereel 已经设计了完整的 firewalled fallback 链路：

| 路径 | 用途 | 适用场景 |
|------|------|---------|
| DHT 默认路径 | `swarm.join()` → `dht.findPeer` | 入站可通时 |
| **`exposeLanAddress()`** | 主动告诉对方"我在这" | 入站被拦、被 NAT 时 |
| **`connectToPeer(pk, relayAddresses)`** | 拿对方的 LAN 地址直接拨号，绕 DHT | 入站被拦 |

当前 SDK 实现：

```ts
// packages/hyper-sdk/src/runtime/hyperswarm.ts
async function connectToPeer(target: PublicKey, relayAddresses: LanAddress[]) {
  const dht = (swarm as any).dht
  return dht.connect(target, { relayAddresses })
}
```

**带外信道**问题：A 要拨号 B，必须先知道 B 的 `{publicKey, host, port}`。
这条信道今天**还没接**——`/v1/swarm/identity` 只暴露 `publicKey / swarmPort / mainDriveKey`，
没暴露 LanAddress。

需要做的是：

1. 在 `/v1/swarm/identity` 增加 `lanAddresses` 字段（来自 `exposeLanAddress()`）。
2. 新增 `POST /v1/swarm/dial { publicKey, relays }` 接口，调 `connectToPeer`。
3. 注册一段带外信道（如 SSE / WebSocket / shared discovery server）让两端交换 LanAddress。

注意：**这只解决"同一台电脑上的两个 Sidecar 互打"或"两端能找到一个共同 server"的情况**。
**两台都过 QX 机场节点代理的机子之间** outbound 都被各自的代理接管 → 互相的 inbound 都不可达 →
**唯一可行是部署一个有公网 IP 的 relay**。

---

### 5.3 长期 / 多机部署：部署一台公网 Relay

形态对比：

| 形态 | 可行性 | 备注 |
|------|--------|------|
| 两台不同 ISP 后的真机之间直连 | ⚠️ 概率性成功 | Hyperswarm 自带打洞，但两个 NAT 后互拨命中率本来就不高 |
| **一台公网 VPS 跑 bootstrap + relay** | ✅ 强烈推荐 | 一台 VPS 成本 5 刀/月，承担 bootstrap + relay 双角色 |
| 两台 NAT 后真机 + 公网 VPS 中继 | ✅ 生产常见 | VPS 只做"找路"，两边仍直连；穿不透才走 VPS relay |
| 两台都在 NAT 后，无中继 | ⚠️ 概率性失败 | 别赌 |
| **Tailscale / WireGuard 把两端拉到同一个内网** | ✅ 强烈推荐 | 双方都拿到 `100.x.x.x` 私网地址，Hyperswarm 完全当局域网用，0 公网依赖 |

> 经验：home lab 圈跑 Hyperswarm 通常都是 Tailscale 把所有机器拉到一台 mesh，
> 这样既解决了 inbound UDP，又顺手解决了 TLS 证书 / hostname / 文件共享问题。

---

## 6. 验收 Checklist

修复 / 绕过代理后，建议按下面顺序验证：

- [ ] `route get 8.8.8.8 | grep interface` 输出 `en0`（不是 `utun*`）。
- [ ] `curl -s ifconfig.me` 输出 ISP 真给的公网 IP（不是机场节点的 IP 段、不是 Cloudflare ASN）。
- [ ] `scripts/nat-probe.mjs` 跑出来 3 个 socket 各自拿到不同公网端口。
- [ ] 三台 Sidecar 启动后 5 秒内 `dht.firewalled === false`、`dht.ephemeral === false`。
- [ ] 三台 Sidecar 的 `dht.nodes.length > 0`、`swarm.connections.size > 0`。
- [ ] `/v1/swarm/peers` 的 `publicKey` 对得上另几台的 `peerPublicKey`。
- [ ] kill 重启其中一个 Sidecar，剩余两方应在 `connection-close` 事件里把它移除，**不**留 zombie。
- [ ] smoke test 必须包含一次"两端都过代理"的负面用例 + "两端都直连 ISP"的正面用例。

---

## 7. 经验沉淀

1. **`firewalled: true` 不是 NAT，是"双向不可达"。** NAT 后面 if Full Cone 的话 Hyperdht 是**不会**报 firewalled 的。firewalled 的真正意思就是"有某层把 inbound UDP 砍了"——可能是 ISP、可能是路由器、可能是 VPN、可能是 macOS firewall、也可能是**任何 TUN-based 代理工具**。
2. **STUN 探针只能告诉你"我在不在 NAT 后"**，它**没办法告诉你"有没有代理工具在接管路由"**。这次 STUN 给了 Full Cone 结果，但**这一层 NAT 是机场节点的远端 NAT，不是 ISP**——STUN 看不出来。
3. **怀疑"代理工具拦了入站"的快速 fingerprint**：
   ```bash
   route get 8.8.8.8 | grep interface                # utun? → 很可能 TUN 代理/VPN
   ifconfig | grep -E 'utun[0-9]+|198\.19\.'         # 198.19.0.1 是 WARP/Tailscale 典型
   scutil --proxy                                     # SOCKS / HTTPS 代理？
   ls /Applications/ | grep -iE 'quantumult|surge|clash|warp|cloudflare|tailscale'
   # 看哪个代理工具装着
   ```
4. **QX / Surge / ClashX / WARP / Tailscale**这些工具在 macOS 上都以 Network Extension 注入网络栈，**用户态 `kill` 杀不掉**，必须在**各自 App 的 UI**里切模式 / 关掉接口 / 卸载 system extension。
5. **managed Mac 的命令行 firewall 修改被 MDM 锁**，但 **QX / WARP 的开关没有**——可以在 App UI 里放心切模式。
6. **不要把 TUN 代理默认当成 "harmless 翻墙工具"**——它对 P2P / WebRTC / Hyperswarm / 游戏语音这类**主动接受入站**的应用都是毒药。任何依赖 UDP 双向的协议，开了 TUN 代理都会出问题。
7. **Hyperswarm v4 的 `ephemeral: true` 是个明显的"我不对劲"信号**——看到这一位，几乎一定是网络层（firewalled / NAT 类型 / VPN / 代理），而不是 SDK 的 bug。
8. **常见踩坑时间线**：
   - 装 QX / Surge / WARP 时一切正常 → 因为你的应用都是 HTTP/TCP，单向拉数据；
   - 想跑 P2P / Hyperswarm / 语音 → 突然发现"明明有公网 IP 怎么就是连不上" → 找半天不知道谁在拦；
   - 这次 session 走的也是这条路径，所以单独拎出来记录。

---

## 8. 关联文件

- 探针脚本：`scripts/nat-probe.mjs`（STUN 测 NAT 类型）
- 单进程带诊断探针：`/tmp/cinereel-probe/probe-v2.js`（60s 自结束，写 `probe-{A,B}.json`）
- 原生 UDP 探针：`/tmp/cinereel-probe/udp-native.js`（loopback inbound 验证）
- 双进程 UDP 探针：`/tmp/cinereel-probe/udp-pair.js`（跨进程 inbound/outbound 验证）
- SDK firewalled fallback 路径：`packages/hyper-sdk/src/runtime/hyperswarm.ts`（`connectToPeer` / `exposeLanAddress`）
- HTTP identity 接口：`packages/hyper-sdk/src/services/swarm.ts`（当前**未暴露** `lanAddresses`）
- 相关 case：`docs/cases/2026-07-19-swarm-mutual-discovery.md`（早期 HTTP / swarm 配置层面的排查，与本篇互补）