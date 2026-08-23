# Cinereel 领域术语

本文件定义 Cinereel 各 Feature 共享的规范领域语言，避免界面名称、技术实现和领域概念相互混用。

## 语言

**Drive**：
拥有独立 `DriveId`、规范 Name，通过 `DriveKey` 关联 Hyperdrive 内容，并持有一个必填 DriveContentTypeId 的数据集合。Drive 使用 `RelationType` 保存当前 Cinereel 与它的关系：`None` 表示没有访问关系，`Ownership` 表示可写控制关系，`Subscription` 表示订阅访问关系；该字段描述当前实例的关系，不是 Drive 的内容类型。Drive 可以在未发布状态下独立存在，创建 Drive 不等于发布。用户主动删除 Drive 时 `RelationType` 必须为 `Ownership`，且关联的 Publication 从未产生或已处于 `Unpublished`；没有任何持久化引用的 OrphanedDrive 则由独立异步流程回收。
_避免使用_：PublishedDrive、PublishDrive

**DriveId**：
由 Cinereel 分配并用于识别 Drive 的稳定身份。DriveId 独立于 Hyperdrive 的公钥和存储实现；Cinereel 的 HTTP Interface 与其他 Feature 均使用 DriveId 引用 Drive。
_避免使用_：DriveKey、HyperdriveKey

**DriveKey**：
Hyperdrive 用于定位和访问文件内容的公钥。DriveKey 是 Drive 关联的技术标识，不是 Drive 的领域身份；同一个值不得同时关联多个 Drive。
_避免使用_：DriveId

**DriveContentType**：
在稳定 DriveContentTypeId 下定义的内容类别，用于提供该类内容的展示信息和文件扫描机制。当前 Cinereel 只支持电影、剧集、音乐与通用四种内置类型；命名空间标识为未来官方或第三方扩展保留兼容方向，但当前不提供扩展发现、安装或动态加载能力。
_避免使用_：HyperdriveType、BlobType、MediaKind

**DriveContentTypeId**：
Drive 持久化的必填、稳定且可跨 Cinereel 实例交换的内容类型标识，使用命名空间字符串为未来扩展避免命名冲突。当前支持的标识只有 `cinereel.movie`、`cinereel.series`、`cinereel.music` 与 `cinereel.generic`。持有 DriveOwnership 可以修改 DriveContentTypeId；真正变更时，类型更新、旧扫描结果失效与 DriveScan 的可靠受理必须保持一致。重复设置当前值不使结果失效，也不启动 DriveScan。DriveContentTypeId 不使用安装时生成的 Guid、C# 类型名或展示名称。
_避免使用_：DriveTypeGuid、ScannerTypeName、ContentTypeDisplayName

**DriveScan**：
使用 Drive 当前 DriveContentTypeId 对全部文件执行扫描并生成派生结果的异步流程。调用方在 DriveScan 可靠受理后即可返回，并通过独立状态观察结果；同一 Drive 同时最多存在一个未完成的 DriveScan，在它进入成功或失败终态前，修改 DriveContentTypeId 必须返回冲突。扫描失败时保留当前 DriveContentTypeId，旧派生结果继续无效，记录安全的失败摘要并允许显式重试，不隐式回滚类型或改用 `cinereel.generic`。
_避免使用_：RefreshDrive、ScanRequest

**DriveOwnership**：
当前 Cinereel 对一个 Drive 持有可写控制能力的关系，在当前 Cinereel 创建 Drive 时以 `Drive.RelationType = Ownership` 建立。只有持有 DriveOwnership，才能修改 Drive 的 Name 与内容，或者 Publish、删除 Drive。DriveOwnership 是 `RelationType` 的一种取值，不使用独立 Entity 或表；同一 Drive 只能保存一个 `RelationType`，因此 DriveOwnership 与 Subscription 互斥。
_避免使用_：LocalDrive、IsLocal、IsWritable

**CreateDrive**：
用户要求当前 Cinereel 创建一个新 Drive 并取得 DriveOwnership 的显式动作。调用方必须提供 IdempotencyKey；相同 IdempotencyKey 与相同规范化请求只能驱动同一次 CreateDrive，并返回同一个创建结果，相同 IdempotencyKey 对应不同请求时拒绝执行。只有 Hyper Client 已创建对应内容，且本地 Drive 已以 `RelationType = Ownership` 持久化后，CreateDrive 才成功返回；本地事务失败时必须补偿删除刚创建的 Hyperdrive，补偿失败则交由可恢复的异步任务继续处理，不能向调用方返回一个 Cinereel 无法识别的 Drive。
_避免使用_：CreatePublishedDrive、PublishDrive

**IdempotencyKey**：
由调用方提供、用于识别一次 CreateDrive 意图的稳定标识。相同 IdempotencyKey 重试同一规范化请求时复用已有创建操作和结果，不创建第二个 Drive；相同 IdempotencyKey 用于不同请求时返回冲突。成功创建使用过的 IdempotencyKey 永久保留且不可复用；Drive 删除后仅保留墓碑，同一请求再次使用该 key 时返回已删除结果。
_避免使用_：DriveId、RequestId、CorrelationId

**Subscription**：
当前 Cinereel 通过 `DriveKey` 找到一个已有 Drive，并以 `Drive.RelationType = Subscription` 保存的访问关系。Subscription 不能修改 Drive 的规范 Name，也不使用独立 Entity 或表。删除 Subscription 会把 `RelationType` 设为 `None` 并清空 Remark，但不删除 Drive。同一 Drive 只能保存一个 `RelationType`，因此 Subscription 与 DriveOwnership 互斥。
_避免使用_：SubscribedDrive、RemoteDrive

**Remark**：
当前 Cinereel 针对 Drive 当前 `RelationType` 保存的可选私有备注，用于覆盖该关系下的 Drive 显示名称。Remark 与 `RelationType` 一同持久化在 Drive 记录中，但不属于 Drive 的规范元数据，不修改规范 Name，也不发布给其他 Cinereel 实例；没有 Remark 时显示 Drive 的 Name，`RelationType` 变为 `None` 时必须清空 Remark。
_避免使用_：DriveName、PublishedName

**OrphanedDrive**：
`RelationType` 为 `None`，并且没有 Publication 或其他持久化关系引用的 Drive。清除最后一个关系的事务提交后，Drive 立即具备异步回收资格，不设置宽限期；关系清除本身不删除 Drive。独立异步回收流程必须在删除 Drive 记录和本地缓存前重新确认它仍然没有任何引用。
_避免使用_：DeletedDrive、UnsubscribedDrive

**Publish**：
用户针对一个已经存在且当前 Cinereel 持有 DriveOwnership 的 Drive 创建或恢复其唯一 Publication 的显式动作。Publish 不负责创建 Drive；Publication 进入 `Publishing` 且发布任务已可靠受理后，Publish 即向调用方返回，不等待 Hyper Client 确认。只有后续确认 announce 完成才代表发布成功。当 Publication 已处于 `Publishing` 或 `Published` 时，重复 Publish 直接返回当前 Publication，不启动新的发布任务。Publication 处于 `Unpublishing` 时拒绝 Publish，用户须等待 Unpublish 完成后再执行。
_避免使用_：CreateDrive

**Unpublish**：
用户停止现有 Publication 对外发布的显式动作。Publication 进入 `Unpublishing` 且取消发布任务已可靠受理后，Unpublish 即向调用方返回，不等待 Hyper Client 确认。只有后续确认 unannounce 完成才代表取消发布成功。Publication 处于 `Failed` 时，Unpublish 仍进入 `Unpublishing` 并防御性执行 unannounce，因为缺少 announce 成功确认不能证明外部从未完成发布。Publication 已处于 `Unpublishing` 或 `Unpublished` 时，重复 Unpublish 直接返回当前 Publication，不启动新的取消发布任务；Publication 处于 `Publishing` 时拒绝 Unpublish，用户须等待 Publish 完成后再执行。
_避免使用_：DeletePublication

**Publication**：
当前 Cinereel 持有 DriveOwnership 的 Drive 的唯一发布关系记录，拥有独立身份和 `Publishing`、`Published`、`Unpublishing`、`Failed`、`Unpublished` 生命周期；一个 Drive 最多关联一个 Publication，不会因重试或重新发布产生重复记录。只有 Hyper Client 确认 announce 完成才从 `Publishing` 进入 `Published`，确认 unannounce 完成才从 `Unpublishing` 进入 `Unpublished`；`Failed` 表示 Publish 重试耗尽且没有收到成功确认，外部状态仍可能不确定。调用方使用 `DriveId` 查询该 Drive 的唯一 Publication，并通过轮询观察异步操作的最终状态。Drive 从未执行 Publish 时不存在 Publication，查询结果必须与真实存在的 `Unpublished` Publication 区分。Publish 和 Unpublish 均进行有限自动重试，Publish 重试耗尽后进入 `Failed`，Unpublish 重试耗尽后回到 `Published` 并记录错误，用户可再次执行对应动作；`Unpublished` 的 Publication 会随 Drive 删除且不作为永久审计记录保留。
_避免使用_：PublishedDrive、DrivePublishedState

**PublicationFailure**：
Publication 当前尚未恢复的最近一次最终失败摘要，包含失败动作、稳定错误码、安全描述、失败时间和尝试次数，供调用方理解并决定是否重试。后续 Publish 或 Unpublish 成功时清除 PublicationFailure；历史失败、Hyper Client 原始响应和技术异常仅保留在日志中。
_避免使用_：RawException、HyperErrorResponse

**PublicationOperation**：
一次被可靠受理的 Publish 或 Unpublish 流程，拥有可区分的身份并涵盖该流程的有限自动重试。同一 Publication 同时最多有一个当前 PublicationOperation；只有与当前 PublicationOperation 匹配的 Hyper Client 确认才能改变 Publication 状态，旧操作的迟到确认仅记录日志。当前操作的重复成功确认按幂等方式接受，不再次改变状态或状态时间。
_避免使用_：BackgroundJob、Request
