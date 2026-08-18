# Cinereel 领域术语

本文件定义 Cinereel 各 Feature 共享的规范领域语言，避免界面名称、技术实现和领域概念相互混用。

## 语言

**Drive**：
拥有独立身份并承载文件内容的数据集合。Drive 可以在未发布状态下独立存在，创建 Drive 不等于发布。关联的 Publication 处于 `Publishing`、`Published`、`Unpublishing` 或 `Failed` 时，Drive 不可删除，必须先显式 Unpublish 并等待进入 `Unpublished`；只有从未产生 Publication 或 Publication 已处于 `Unpublished` 的 Drive 才可删除。
_避免使用_：PublishedDrive、PublishDrive

**Publish**：
用户针对一个已经存在的本地 Drive 创建或恢复其唯一 Publication 的显式动作。Publish 不负责创建 Drive；Publication 进入 `Publishing` 且发布任务已可靠受理后，Publish 即向调用方返回，不等待 Hyper Client 确认。只有后续确认 announce 完成才代表发布成功。当 Publication 已处于 `Publishing` 或 `Published` 时，重复 Publish 直接返回当前 Publication，不启动新的发布任务。Publication 处于 `Unpublishing` 时拒绝 Publish，用户须等待 Unpublish 完成后再执行。
_避免使用_：CreateDrive

**Unpublish**：
用户停止现有 Publication 对外发布的显式动作。Publication 进入 `Unpublishing` 且取消发布任务已可靠受理后，Unpublish 即向调用方返回，不等待 Hyper Client 确认。只有后续确认 unannounce 完成才代表取消发布成功。Publication 处于 `Failed` 时，Unpublish 仍进入 `Unpublishing` 并防御性执行 unannounce，因为缺少 announce 成功确认不能证明外部从未完成发布。Publication 已处于 `Unpublishing` 或 `Unpublished` 时，重复 Unpublish 直接返回当前 Publication，不启动新的取消发布任务；Publication 处于 `Publishing` 时拒绝 Unpublish，用户须等待 Publish 完成后再执行。
_避免使用_：DeletePublication

**Publication**：
本地 Drive 唯一的发布关系记录，拥有独立身份和 `Publishing`、`Published`、`Unpublishing`、`Failed`、`Unpublished` 生命周期；一个 Drive 最多关联一个 Publication，不会因重试或重新发布产生重复记录。只有 Hyper Client 确认 announce 完成才从 `Publishing` 进入 `Published`，确认 unannounce 完成才从 `Unpublishing` 进入 `Unpublished`；`Failed` 表示 Publish 重试耗尽且没有收到成功确认，外部发布状态仍可能不确定。调用方使用 `DriveId` 查询该 Drive 的唯一 Publication，并通过轮询观察异步操作的最终状态。Drive 从未执行 Publish 时不存在 Publication，查询结果必须与真实存在的 `Unpublished` Publication 区分。Publish 和 Unpublish 均进行有限自动重试，Publish 重试耗尽后进入 `Failed`，Unpublish 重试耗尽后回到 `Published` 并记录错误，用户可再次执行对应动作；`Unpublished` 的 Publication 会随 Drive 删除且不作为永久审计记录保留。
_避免使用_：PublishedDrive、DrivePublishedState

**PublicationFailure**：
Publication 当前尚未恢复的最近一次最终失败摘要，包含失败动作、稳定错误码、安全描述、失败时间和尝试次数，供调用方理解并决定是否重试。后续 Publish 或 Unpublish 成功时清除 PublicationFailure；历史失败、Hyper Client 原始响应和技术异常仅保留在日志中。
_避免使用_：RawException、HyperErrorResponse

**PublicationOperation**：
一次被可靠受理的 Publish 或 Unpublish 流程，拥有可区分的身份并涵盖该流程的有限自动重试。同一 Publication 同时最多有一个当前 PublicationOperation；只有与当前 PublicationOperation 匹配的 Hyper Client 确认才能改变 Publication 状态，旧操作的迟到确认仅记录日志。当前操作的重复成功确认按幂等方式接受，不再次改变状态或状态时间。
_避免使用_：BackgroundJob、Request
