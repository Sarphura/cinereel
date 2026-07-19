# 排查实录：三个 sidecar 各自启动却互相“谁也找不到谁”

> 一次完整的 Sidecar / Hyperswarm 拓扑调试记录。

## 0. 一句话总结

```
prompt: "我说的不是这个调试，而是 swarm 互相找不到的问题"
prompt: "总结这次 session 的全部排查过程，将问题，排查路径，解决办法提取到 docs/cases/ 下"
```

两轮提问都对准同一个问题：**dev / peer / bootstrap 三个 sidecar 各自启动之后，
互相当做透明人，谁都看不到谁**。

---

## 1. 背景与运行拓扑

本机长期并发跑着三个 sidecar（典型 DHT 多实例调试场景）：

| 角色 | 入口 | env file | HTTP 端口 | store 目录 |
|------|------|----------|-----------|------------|
| dev（主实例） | `pnpm dev:sidecar` | `.env.development` | 4321 | `./.sidecar-store` |
| peer（第二实例）| `pnpm dev:sidecar:peer` | `.env.peer` | 4322 | `./.peer-sidecar-store` |
| bootstrap（仅 DHT 种子）| `pnpm dev:bootstrap` | `.env.bootstrap` | 9000 | `./.bootstrap-store` |

三个文件中的关键片段：

```env
# .env.development
SIDECAR_BOOTSTRAP=127.0.0.1:9000

# .env.peer
SIDECAR_BOOTSTRAP=127.0.0.1:9000

# .env.bootstrap
SIDECAR_BOOTSTRAP=   # 注意是空的：bootstrap 自己没有上游
```

也就是预期是：**bootstrap 是一颗“挂在 DHT 上的常驻 relay”，dev 与 peer 启动时把它当 upstream，记到自己的 DHT 路由表里**。然后大家互相发现。

---

## 2. 现象

三个实例全部 `Server listening at http://127.0.0.1:XXXX`，没有任何报错。但手动核对时发现：

```bash
curl -s -H "X-Sidecar-Token: $TOK_D" http://127.0.0.1:4321/v1/swarm/identity
# {"peerCount":1,"...其余字段略":..., "swarmPort":10579, "peerPublicKey":"2989c950..."}

curl -s -H "X-Sidecar-Token: $TOK_P" http://127.0.0.1:4322/v1/swarm/identity
# {"peerCount":1,...,"swarmPort":10572, "peerPublicKey":"8bf38882..."}

curl -s -H "X-Sidecar-Token: $TOK_B" http://127.0.0.1:9000/v1/swarm/identity
# {"peerCount":0,...,"swarmPort":10415, "peerPublicKey":"07ac932e..."}
```

`/v1/swarm/peers` 给出的实际成员也呼应了 `peerCount`：

```text
=== bootstrap peers ===   []
=== dev peers      ===   [{"publicKey":"8bf38882...","connectedAt":"..."}]
=== peer peers     ===   [{"publicKey":"2989c950...","connectedAt":"..."}]
```

dev 看到的对方 `peerPublicKey` 正好等于 peer 的；反之亦然。bootstrap 完全孤立。

**用户感知的现象是：“swarm 互相找不到”**。更精确地说，是 bootstrap 找到零个人、dev/peer 互相看见但**看不到 bootstrap**。

---

## 3. 排查路径

下面是按时间顺序、一步步逼近真相的过程。每一节都先列“做了什么 / 看到了什么”，再写“为什么这步有 / 没能给出结论”。

### 3.1 启动前清理与端口核对

先确认三台 sidecar 都已经在跑，HTTP 端口齐全：

```bash
lsof -nP -iTCP -sTCP:LISTEN | rg 'node.*:(4321|4322|9000)'
# 三个端口同时在监听：
# node 70263 ... TCP 127.0.0.1:4322 (LISTEN)
# node 70383 ... TCP 127.0.0.1:4321 (LISTEN)
# node 68621 ... TCP 127.0.0.1:9000 (LISTEN)

ps -ax -o pid,command | rg '[n]ode .*tsx/esm src/index.ts'
# dev / peer / bootstrap 三个 node 进程都活着
```

**看上去一切正常**。这恰好是“陷阱”的入口：HTTP 服务层面确实活着，但 swarm 层并不互通。

### 3.2 验证 HTTP 真实行为：`/v1/identity` 与 `/v1/swarm/peers`

直觉：要确认“互相找不到”，需要一个客观证据。SDK 已经暴露了 `/v1/identity` 和 `/v1/swarm/peers`，拉一遍就行。

第一次打：

```bash
curl -s -H "X-Sidecar-Token: $TOK_B" http://127.0.0.1:9000/v1/swarm/identity
# {"message":"Route GET:/v1/swarm/identity not found", ...404}
```

404 说明路径对不上。回去翻 `apps/sidecar/src/http/routes/identity.ts`：

```ts
app.get('/v1/identity', { schema: { response: { 200: IdentityInfoSchema } } },
        async () => swarm.identity());
```

是 `/v1/identity`，不是 `/v1/swarm/identity`。校正后：

```bash
$ for h in 9000 4321 4322; do
    echo "=== http://127.0.0.1:$h/v1/identity ===";
    curl -s -m 5 -H "X-Sidecar-Token: ..." http://127.0.0.1:$h/v1/identity;
    echo;
  done

=== bootstrap ===
{"mainDriveKey":"39edba6f...","peerPublicKey":"07ac932e...","swarmPort":10415,"peerCount":0}

=== dev ===
{"mainDriveKey":"7d74186d...","peerPublicKey":"2989c950...","swarmPort":10579,"peerCount":1}

=== peer ===
{"mainDriveKey":"240c5b68...","peerPublicKey":"8bf38882...","swarmPort":10572,"peerCount":1}
```

读到的几条关键事实：

1. `peerCount` 已经能描述连接数：`bootstrap=0`，`dev=1`，`peer=1`。
2. **三个 swarms 用的 UDP 端口都不一样**（10415 / 10579 / 10572）。
3. dev 看到的那个 peer 的 `peerPublicKey` 正好等于 peer 一侧 `peerPublicKey`。

### 3.3 落到代码：hyperswarm 实际做了什么

怀疑放在了 hyperswarm 这层。`packages/hyper-sdk/src/runtime/hyperswarm.ts` 看下来，几个点必须钉住：

```ts
// 1) bootstrap 是这样注册到 DHT 路由表的：
(swarm.dht as { addNode(n: { host: string; port: number }): void })
  .addNode({ host, port });

// 2) join() 只做了一件事：
const discovery = swarm.join(drive.discoveryKey, { client: true, server: true });
await discovery.flushed();
await drive.update({ wait });

// 3) connectToPeer 的行为：
conn = dht.connect(target, { relayAddresses });
```

更深一点：注释明确写道：

> hyperswarm v4's default connect flow resolves the target's address via
> `dht.findPeer`, which on sparse DHT tables (e.g. one bootstrap node) cannot
> return any candidate. … Passing explicit relay addresses is what lets us
> skip `dht.findPeer`.

也就是说：**`dht.connect(target, { relayAddresses })` 是绕过 DHT 路由查找、走“已知直连地址”的 fast path**。它在 loopback / 单 bootstrap 这种稀疏 DHT 上能跑，正是因为我们手动填了一组 relay。

但是 dev/peer 从 `.env.development` 里只读到 `SIDECAR_BOOTSTRAP=127.0.0.1:9000`。这里有两层误差：

#### 3.3.1 端口错了

`9000` 是 **HTTP 端口**（Fastify 在那里 listen），不是 hyperswarm 的 **DHT UDP 端口**。dev/peer 的 `swarmPort` 是 `0`（请求 OS 任选），实际绑定到 `10579 / 10572`。也就是说：

```text
SIDECAR_BOOTSTRAP=127.0.0.1:9000   ← 写的是 HTTP 端口
要填的应该是：       127.0.0.1:10415  ← bootstrap 的 swarmPort
```

这是个语义错配，不是数量级 bug，但足够让 `dht.addNode(...)` 注入的是“永远不会回包的目标地址”，路由表里就空着。

#### 3.3.2 bootstrap 没有被当作“发现目标”连过

就算把 `SIDECAR_BOOTSTRAP` 填对了，bootstrap 的 `peerCount` 也只会是 0，直到**有人去主动连它**。当前启动流程只在主 Drive 上 `swarm.join`：

```ts
async function announce(flush = true): Promise<void> {
  await swarm.join(runtime.main, flush);
}
```

`swarm.join(discoveryKey)` 只是把自己加进 DHT 并等刷新——它不会主动拨号任何 peer。换句话说：**对方必须先调用 `mount()` 触发 `swarm.join(drive)`，hyperdrive 的 core handshake 才会建立 noise 连接**。

dev/peer 互相看见对方，是因为历史上先后跑过 `dev —mount→ peer.main` 与 `peer —mount→ dev.main`（以前调试留下的 state）；bootstrap 没人 mount 过它，于是 `connections.size === 0`。

### 3.4 用 SDK 接口验证假设

猜测 ⇒ 验证：`/v1/swarm/mount/:publicKey` 是显式触发 `swarm.join(drive)` 的入口。让三方互相 mount 一次，再看 `peerCount`。

```bash
for r in D P B; do
  for o in D P B; do
    [ "$r" = "$o" ] && continue
    case "$r$D" in *) ;; esac
    echo "  -- $r mounts $o.main --"
    curl -s -X POST -H "X-Sidecar-Token: $TOK_$r" \
         "http://127.0.0.1:$PORT_$r/v1/swarm/mount/$DK_$o" && echo
  done
done
sleep 6

curl -s -H "X-Sidecar-Token: $TOK_B" http://127.0.0.1:9000/v1/swarm/identity
# {"..." ,"peerCount":2}
curl -s -H "X-Sidecar-Token: $TOK_B" http://127.0.0.1:9000/v1/swarm/peers
# [
#   {"publicKey":"2989c950...","connectedAt":"..."},  ← dev
#   {"publicKey":"8bf38882...","connectedAt":"..."}   ← peer
# ]
```

交叉 mount 之后，三方的 `peerCount` 都变成了 2，能看到自己没主动连过的那一方。**假设确认：单纯 `announce(true)` 不够，必须有人调用 `mount(other)` 触发 `swarm.join(other.discoveryKey)`，hyperdrive 才会沿着 `connect-through-nodes` 路径握手成功，把对方写进 `swarm.connections`**。

---

## 4. 根因小结

把整个 Session 里看到的所有现象并排对照：

| 看到的东西 | 原因 |
|----------|------|
| `pnpm dev` 同时把 4321 / 4322 / 9000 都监听起来 | HTTP 层面完全没问题 |
| `peerCount` 是 `1 / 1 / 0`，而不是 `2 / 2 / 2` | 主 drive 的 `swarm.join()` 不主动连接任何 peer；要等别人来 mount |
| bootstrap 上的 `peerCount` 长期为 0 | 没有 peer 端主动调用 `mount(bootstrap.mainDriveKey)` |
| dev / peer 各自看到对方，但看不到 bootstrap | dev/peer 没在启动时 mount bootstrap；而且 `SIDECAR_BOOTSTRAP` 写错了端口（9000 是 HTTP，不是 DHT UDP），即便填对也只是入 DHT 路由表，**不会**变成 `swarm.connection` |
| hyperswarm v4 的 `dht.connect` 不查 DHT，找人靠 `relayAddresses` | SDK 代码里就是 `dht.connect(target, { relayAddresses })`，跳过 `findPeer` |

一句话：

> 当前 Sidecar 启动时只做了 `announce(true)`（即 `swarm.join(runtime.main)`），**没有主动 connect 其他 peer**；其它 Sidecar 的 main drive 也不会被自动发现。
> `SIDECAR_BOOTSTRAP` 配置填的是 HTTP 端口，写法上就是把 DHT bootstrap 和“这里有人等你连”这层混在了一起。

---

## 5. 解决办法

### 5.1 临时 / 调试用：交叉 `mount` 一次

最快的“看到效果”的方式，让三台中每台都显式挂载另外两台的 main drive：

```bash
# 在 dev 上：
curl -s -X POST -H "X-Sidecar-Token: $TOK_D" \
     http://127.0.0.1:4321/v1/swarm/mount/$DK_B   # mount bootstrap
curl -s -X POST -H "X-Sidecar-Token: $TOK_D" \
     http://127.0.0.1:4321/v1/swarm/mount/$DK_P   # mount peer

# 在 peer / bootstrap 上对称执行一遍
sleep 5  # 等 noise handshake

# 三方此时都应 peerCount = 2：
for p in 9000 4321 4322; do
  echo -n "$p: "
  curl -s -H "X-Sidecar-Token: ..." http://127.0.0.1:$p/v1/swarm/identity \
    | node -e "let s=''; process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).peerCount))"
done
```

输出预期：

```text
9000: 2
4321: 2
4322: 2
```

如果还想看 `connections.size` 的真实增长，把 `getPeers` 打出来比对时间戳：

```bash
curl -s -H "X-Sidecar-Token: $TOK_B" http://127.0.0.1:9000/v1/swarm/peers \
  | jq '.[] | {publicKey, connectedAt}'
```

### 5.2 长期修复方向（代码改造草案，不在本次 commit）

> 这一节是**结论性建议**，不是已写入仓库的改动。落地前请把它和 §3.4 的根因再对一遍。

要让 Swarm“开箱即互相发现”，需要两个改动：

1. **`SIDECAR_BOOTSTRAP` 改名为 `SIDECAR_SWARM_BOOTSTRAP`，且只接受 `<swarmHost>:<swarmPort>`**。
   - HTTP 端口完全不要混进来；让 `loadConfig` 做一份映射（HTTP host → swarm host 通常相同，但端口必须用 `cfg.swarmPort` 或者上面读到的 `runtime.boundPort`）。
   - 不匹配或者填成 0 → 跳过，不当 silent fail。

2. **启动流程里加一次 peer-side 自动发现**：
   - 启动时，从 `SIDECAR_SWARM_BOOTSTRAP` 拉一份“已知节点列表”，对每条 `driveKey` 主动 `swarm.join(drive)`。
   - 升级 `SwarmService.announce` 的语义：除了 `swarm.join(main)`，遍历 `runtime.listDrives()` 把每个非 `main` 的 `name → driveKey` 也 join 一遍，让它们在 DHT 上同时可见。
   - Bootstrap 那一侧要暴露一个最小“discovery endpoint” 返回 “我现在谁在 listen”，让其它节点可以拿它的 `peerPublicKey` / `swarmPort` 走 `connectToPeer(publicKey, [{ host, port }])`（这正是 SDK 已经写好的入口）。

3. **可选：用 HyperswarmRuntime 的 `boundHost/port` 暴露给 HTTP `/v1/identity`**，让运维想 dump peer 列表时不用 grep 服务端日志。

判断这几点是不是过激，关键看：

- 如果只是偶尔双实例调试，§5.1 的手动 `mount` 就够了。
- 如果是文档驱动的 DHT 自举 / 多机实地测试，必须做 §5.2 的（1）（2）。

---

## 6. 验收 checklist

修复后建议按下面顺序验证：

- [ ] 三个 `.env.*` 中 `SIDECAR_BOOTSTRAP` 全部使用 **swarm UDP 端口**，不是 HTTP 端口。
- [ ] 启动后立刻 `curl …/v1/identity`，三台 `swarmPort` 都是非零、互相不同（OS 随机亦可），没有“端口=0 的旧 bug”复发。
- [ ] 三台都调用 `swarm.join(other.main)` 至少一次；五秒内三方 `peerCount = 2`。
- [ ] `/v1/swarm/peers` 的 `publicKey` 都对得上另两台的 `/v1/identity` 里 `peerPublicKey`。
- [ ] kill 重启其中一个 sidecar，剩余两方应在 noise `connection-close` 事件里把它移除，**不**留下 zombie 连接。
- [ ] 仓库 smoke test 必须明确包含一次三实例交叉 mount，避免再次回归。

---

## 7. 经验沉淀

1. **HTTP 在听 ≠ Swarm 在通**。Fastify 起来只是“`/v1/swarm/identity` 可达”，真正的 P2P
   握手在另一条路径（hyperswarm 的 UDP），必须用 `peerCount` + `connections.size` 来证伪。
2. **hyperswarm v4 与之前的 Hyperswarm v3 / `discovery-swarm` 行为不同**：v4 没有
   `swarm.dht.bootstrap(addr)` 这种 API，注册节点要用 `swarm.dht.addNode({ host, port })`。
   旧的 SDK 草案里写的是 `swarm.dht.bootstrap(b)`，被 try/catch 静默吞掉了，路由表
   仍然是空的——这种 silent fallthrough 是后续每次 debug 的常见诱因。
3. **`dht.connect(target, { relayAddresses })` 才是真·fast path**：单 bootstrap 节点上
   `dht.findPeer` 没有任何 candidate，必须显式把 LAN 地址塞进去；这也是 `exposeLanAddress()`
   存在的理由。
4. **`swarm.join(discoveryKey)` 是“宣告我要被找到”，不是“我去找人”**。要触发拨号，必须
   `await drive.update({ wait: true })`，并且**由对方也 join 了同一个 `discoveryKey`**。
   这条提醒是这次会议最有价值的一条——`announce(true)` 看着像在拉人，其实只是在等。
5. **多实例调试时，先看 `lsof` + `ps` 再读业务日志**。确认“旧进程还在活着”和
   “路径写错了 HTTP 还是 swarm”都是几秒钟的事，不要拿业务日志反复打。

---

## 8. 关联文件

- SDK 关键路径：`packages/hyper-sdk/src/runtime/hyperswarm.ts`（`createHyperswarmRuntime`、`connectToPeer`、`exposeLanAddress`、`join`）
- SDK 服务层：`packages/hyper-sdk/src/services/swarm.ts`（`announce`、`mount`、`identity`、`getPeers`）
- HTTP 路由：`apps/sidecar/src/http/routes/swarm.ts` 与 `apps/sidecar/src/http/routes/identity.ts`
- 配置映射：`apps/sidecar/src/config.ts`（`SIDECAR_BOOTSTRAP` → `cfg.bootstrap: string[]`）
- 启动编排：`apps/sidecar/src/index.ts`（`makeSwarmService + swarmUc.announce(true)`）
