# ADR-0004：异步创建 Drive 并公开生命周期

- 状态：已接受
- 日期：2026-08-19
- 修订：2026-08-23

## 背景

CreateDrive 同时跨越两个不能共享数据库事务的资源：Cinereel 负责持久化 Drive，Hyper Client 负责创建 Hyperdrive 并返回 `DriveKey`。Hyper Client 请求可能耗时、失败或在响应返回前完成，调用方也需要观察创建中的 Drive，而不是让每个请求都承担一套同步补偿机制。

此前选择同步等待 Hyper Client，并使用独立的 DriveCreationOperation 记录跨资源补偿状态。该方案把 Drive 与其创建过程拆成两份具有相同身份、名称和内容类型的数据，还要求请求线程处理外部调用、本地提交和补偿删除。随着 Hyper Client 调用增多，这种机制会扩大重复模型与失败路径。

## 决策

- CreateDrive 的 HTTP Interface 要求调用方提供 `Idempotency-Key`。
- Cinereel 先生成 `DriveId`，在一个本地事务中持久化 `Status = Pending`、`RelationType = Ownership` 的 Drive，然后返回 `202 Accepted` 和该 Drive。
- Drive 自身就是可靠的创建任务，不建立独立的 DriveCreationOperation Entity、表或 Repository。
- Drive 使用 `Pending`、`Ready`、`Failed`、`Deleted` 表达创建与可用生命周期；`RelationType` 继续独立表达 `None`、`Ownership`、`Subscription` 访问关系。
- `Pending` Drive 尚无 `DriveKey`，可以被查询和展示，但不得执行文件、挂载、发布等依赖内容可用的操作。
- `DriveCreationJob` 扫描 Pending Drive，并调用 Hyper Client 的 `EnsureDriveAsync`。该调用以 `DriveId` 作为稳定 namespace，对同一 Drive 重试时必须返回同一个 Hyperdrive，而不是重复创建。
- Hyper Client 成功后，Cinereel 写入 `DriveKey` 并把 Drive 转为 `Ready`；只有 Ready Drive 必须具有 `DriveKey`。
- Hyper Client 或本地完成提交失败后，Drive 转为 `Failed`。用户可以显式重试，重试先把 Drive 转回 `Pending`，再由同一后台流程处理。
- 创建失败不执行补偿删除。因为 `EnsureDriveAsync` 可重试，即使 Hyper Client 已创建内容但响应丢失，后续仍能通过相同 DriveId 取得同一个 DriveKey。
- `Idempotency-Key` 与规范化请求摘要直接保存在 Drive 上，并具有唯一约束。
- 相同 key 与相同规范化请求复用同一个 Drive；Ready 时返回现有结果，Pending 时返回受理结果，Failed 时再次提交会把它转回 Pending。
- 相同 key 对应不同规范化请求时返回 `409 Conflict`。
- 删除 Drive 时记录转为 `Deleted`、`RelationType` 转为 `None`，并保留 key、请求摘要与原 `DriveId` 作为永久墓碑。相同请求命中墓碑时返回 `410 Gone`，不同请求复用该 key 时仍返回 `409 Conflict`。

本 ADR 不指定轮询间隔、重试退避、`Idempotency-Key` 文本格式或其他 HTTP 失败状态码。Implementation 必须保证 Pending Drive 在进程重启后仍可继续处理，并保证 Hyper Client 的确保操作对同一 DriveId 幂等。

## 备选方案

### 同步创建并补偿部分失败

此方案只在 Hyper Client 与本地提交都成功后返回 `201 Created`，调用方不需要观察中间状态。

但请求耗时包含远程创建，进程在跨资源步骤之间终止时还需要独立 Operation、补偿删除与恢复状态机。Drive 与创建操作保存重复数据，机制成本会随着 Hyper Client 请求增加，因此不采用。

### 保留独立 DriveCreationOperation

此方案把任务执行记录与用户可见 Drive 分离，适合需要完整尝试历史、独立调度优先级或复杂队列语义的场景。

当前创建流程只有一个外部确保操作，用户也希望直接观察 Drive 的创建状态。独立 Operation 不提供额外业务能力，却引入双表一致性和额外 Repository，因此不采用。

### Hyper Client 成功后立即返回

此方案响应速度快，本地 Drive 可以在后台补写。

但调用方可能得到一个 Cinereel 尚不能通过 `DriveId` 查询、授权或管理的 Hyperdrive；补写永久失败时还会形成系统无法管理的资源，因此不采用。

### 不提供请求级幂等

此方案把每次 POST 都视为新的创建意图，Interface 最小。

但调用方无法区分请求未执行与执行成功后响应丢失，可靠重试会产生重复 Drive，因此不采用。

### 删除时释放 Idempotency-Key

此方案允许回收旧 key，也不需要保留 Deleted Drive。

但延迟响应或离线客户端稍后重试时，同一个创建意图会产生新的 Drive，违反 key 的稳定语义，因此不采用。

## 后果

正面影响：

- HTTP 请求只负责可靠写入本地状态，不受 Hyper Client 创建耗时影响。
- Drive 同时承载用户可见资源和创建任务，不再维护重复的 Operation 模型。
- Pending 与 Failed 状态可以直接在页面展示，用户能够观察和重试创建。
- 进程重启后只需扫描 Pending Drive，即可恢复未完成创建。
- `EnsureDriveAsync` 消除了响应丢失后的重复创建与补偿删除需求。
- 永久墓碑保证迟到的幂等重试不会重新创建已删除 Drive。

代价与约束：

- 所有读取方和后续用例必须识别 DriveStatus，内容操作只能接受 Ready Drive。
- Pending Drive 的 `DriveKey` 为空，HTTP DTO 和前端模型必须处理该状态。
- 后台 Job 需要持续扫描或调度 Pending Drive，并对单项失败进行隔离。
- Failed 不会自动无限重试，需要用户显式发起重试。
- Deleted Drive 会持续占用少量存储，以换取永久幂等语义。
