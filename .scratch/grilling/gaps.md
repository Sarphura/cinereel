# Grill 三边对齐 Gap 表

**会话目标**：spec（两份）vs 代码 vs tickets 三边对齐，本轮聚焦术语/命名/词汇不一致。

**口径**：
- 「spec 怎么叫」= `docs/spec/app-server.md` 与 `docs/spec/hyper-agent.md` 的规范术语
- 「code 怎么叫」= `apps/hyper-agent/` 与 `apps/service/` 实际源码、package、env、log
- 「tickets 怎么叫」= `.scratch/{app-server,hyper-agent}/issues/*.md`
- 「gap」= 上述三方**不一致**且**会引发误解或 bug** 的项

| # | 概念 | spec 命名 | code 命名 | ticket 命名 | 严重度 | 处理 |
|---|---|---|---|---|---|---|