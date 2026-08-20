# ADR-0004：同步创建 Drive 并补偿部分失败

- 状态：已接受
- 日期：2026-08-19

## 背景

CreateDrive 同时跨越两个不能共享数据库事务的资源：Hyper Client 负责创建 Hyperdrive 并返回 `DriveKey`，Cinereel 负责持久化 Drive 与 DriveOwnership。调用方需要知道一次创建请求何时真正得到可用、可写且能被其他 Feature 引用的 Drive。

如果任一侧单独成功，系统都会留下半成品：只有本地记录时无法访问内容，只有 Hyperdrive 时 Cinereel 无法通过 `DriveId` 管理它。进程还可能在两个步骤之间终止，因此只依靠请求内的异常处理不足以保证最终清理。

因此需要确定 CreateDrive 是同步完成、异步受理，还是允许部分成功对调用方可见。

## 决策

- CreateDrive 对调用方呈现同步完成语义，不引入公开的 `Provisioning` Drive 状态。
- CreateDrive 的 HTTP Interface 要求调用方提供 `Idempotency-Key`。
- Cinereel 在调用 Hyper Client 前生成 `DriveId`，并以 `Idempotency-Key` 留下可在进程重启后恢复的创建操作依据。
- `Idempotency-Key` 与规范化请求内容必须一起持久化，并具有唯一约束。
- 相同 `Idempotency-Key` 与相同规范化请求只能驱动同一次创建操作；重试进行中的操作时复用其执行，操作成功后重放同一个 Drive 结果。
- 相同 `Idempotency-Key` 对应不同规范化请求时返回 `409 Conflict`，不调用 Hyper Client。
- 成功创建使用过的 `Idempotency-Key` 永久保留且不可用于新的创建意图。
- Drive 存在期间，相同 key 与相同请求重放原创建结果；Drive 删除后，完整幂等结果缩减为保留 key、请求摘要与原 `DriveId` 的墓碑。
- 相同请求命中墓碑时返回 `410 Gone`，不同请求复用墓碑中的 key 时仍返回 `409 Conflict`。
- Hyper Client 创建 Hyperdrive 并返回 `DriveKey` 后，Cinereel 在同一个本地事务中持久化 Drive 与 DriveOwnership。
- 只有 Hyper Client 创建成功且本地事务提交成功后，CreateDrive 才返回新 Drive；HTTP Adapter 使用 `201 Created`。
- Hyper Client 创建失败时不持久化 Drive 或 DriveOwnership，并向调用方返回失败。
- Hyper Client 已创建成功但本地事务失败时，Cinereel 必须尝试删除本次刚创建的 Hyperdrive。
- 同步补偿失败时，恢复任务必须根据持久化的创建操作依据继续重试清理；不能把无法通过 `DriveId` 管理的 Drive 返回给调用方。
- 补偿与恢复只能删除本次创建操作产生且尚未交付成功的 Hyperdrive，不得清理已经完成创建的 Drive 内容。
- 创建操作、补偿和恢复必须支持幂等执行，避免重试产生多个 Drive 或误删已经成功交付的 Drive。

本 ADR 不指定 `Idempotency-Key` 的文本格式，也不指定持久化产品、后台任务框架、补偿重试次数或其他 HTTP 失败状态码；Implementation 必须满足上述可恢复性和幂等约束。

## 备选方案

### 异步创建并返回 202 Accepted

此方案可以先持久化 `Provisioning` 状态和创建任务，再由后台完成 Hyper Client 调用。跨进程恢复自然，HTTP 请求也不会受创建耗时影响。

但 Drive 会新增公开状态机，所有读取与后续动作都必须处理尚未可用的 Drive。Hyperdrive 创建是当前实例上的短操作，首版不需要向调用方暴露这层复杂性，因此不采用。

### Hyper Client 成功后立即返回

此方案的响应速度最快，本地 Drive 与 DriveOwnership 可以在后台补写。

但调用方可能得到一个 Cinereel 尚不能通过 `DriveId` 查询、授权或 Publish 的 Hyperdrive；补写永久失败时还会形成对调用方可见但系统无法管理的资源，因此不采用。

### 先持久化 Drive 再调用 Hyper Client

此方案可以先建立 `DriveId` 与 DriveOwnership，再异步或同步补充 `DriveKey`。

但在 Hyper Client 失败期间，Drive 记录没有可访问的内容，仍然需要公开的中间状态与清理规则，与同步完成的 Interface 不符，因此不采用。

### 使用可选 Idempotency-Key

此方案允许支持幂等的调用方安全重试，同时保留普通 POST 的低接入成本。

但未提供 key 的请求在响应丢失后仍可能重复创建；Drive 创建本身需要持久操作依据，可选 key 只会形成两套执行路径，因此不采用。

### 不提供请求级幂等

此方案把每次 POST 都视为新的创建意图，Interface 最小。

但调用方无法区分请求未执行与执行成功后响应丢失，可靠重试会产生重复 Drive 和 Hyperdrive，因此不采用。

### 只在 Drive 存在期间保留幂等记录

此方案可以在删除 Drive 时一并删除创建操作记录，不需要维护墓碑。

但响应严重延迟或离线客户端稍后重试时，同一个创建意图会在原 Drive 删除后产生新的 Drive，违反 key 的稳定语义，因此不采用。

### 固定保留二十四小时

此方案可以限制幂等记录数量，也覆盖大多数即时网络重试。

但幂等保证会出现时间边界，调用方无法仅凭 key 判断请求是否仍受保护；超过期限的迟到重试仍会重复创建，因此不采用。

## 后果

正面影响：

- 成功响应中的 Drive 已经可查询、可写，并能被其他 Feature 通过 `DriveId` 引用。
- 调用方不需要理解 `Provisioning` 状态或轮询创建结果。
- 调用方可以使用相同 `Idempotency-Key` 安全重试，不会重复创建 Drive。
- Drive 删除后保留墓碑，迟到重试也不会重新创建资源。
- 部分失败不会把无法管理的 Hyperdrive 暴露给调用方。
- 持久恢复依据使进程在两个步骤之间终止后仍能继续补偿。

代价与约束：

- HTTP 请求耗时包含 Hyper Client 创建和本地事务提交。
- Implementation 需要持久化创建操作依据，并实现同步补偿、后台恢复与幂等保护。
- HTTP Adapter 必须校验 `Idempotency-Key`，应用 Implementation 必须校验同一 key 的请求内容一致。
- 持久化层需要支持永久幂等 key 和紧凑墓碑；记录数量会随创建意图持续增长。
- Hyper Client Adapter 必须能区分并安全删除某次未完成操作创建的 Hyperdrive。
- 在本地持久化不可用且补偿也失败的极端情况下，恢复依据本身如何可靠写入需要由基础设施设计解决。
