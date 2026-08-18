# ADR-0001：将发布建模为独立的异步 Publication

- 状态：已接受
- 日期：2026-08-18

## 背景

Cinereel 需要通过 Hyper Client 将已有 Drive announce 到外部网络，并在用户取消发布时执行 unannounce。Hyper Client 的处理与确认可能延迟、失败、重复或乱序，因此一次 HTTP 请求的结束不能等同于发布成功。

Drive 可以独立存在，创建 Drive 并不代表发布。发布关系还需要表达进行中、成功、失败、取消中和已取消等状态，并约束 Drive 删除、重复命令、自动重试和迟到确认。

## 决策

### 领域边界

- Publish 只针对已有 Drive，不创建 Drive。
- 每个 Drive 最多关联一个拥有独立身份的 Publication。
- 重试或重新 Publish 复用原 Publication，不创建重复记录。
- 从未 Publish 的 Drive 不存在 Publication；这与真实存在的 `Unpublished` Publication 是不同事实。
- 单个 Publication 通过 `DriveId` 查询，调用方通过轮询观察异步结果。

### 状态机

Publication 使用以下状态：

- `Publishing`：Publish 已可靠受理，正在等待 announce 完成确认。
- `Published`：Hyper Client 已确认 announce 完成。
- `Unpublishing`：Unpublish 已可靠受理，正在等待 unannounce 完成确认。
- `Failed`：Publish 的有限自动重试已耗尽，且未收到 announce 成功确认；外部状态仍可能不确定。
- `Unpublished`：Hyper Client 已确认 unannounce 完成。

允许的主要状态迁移为：

```text
不存在 ──Publish──> Publishing ──announce 已确认──> Published
                         └──重试耗尽────────────> Failed

Failed ─────Publish──> Publishing
Unpublished ─Publish──> Publishing

Published ──Unpublish──> Unpublishing ──unannounce 已确认──> Unpublished
Failed ─────Unpublish──> Unpublishing
                               └──重试耗尽──────────────> Published
```

从 `Failed` 执行 Unpublish 时必须防御性执行 unannounce，因为未收到成功确认不代表外部一定没有完成 announce。

### 异步受理

- Publish 在 Publication 进入 `Publishing` 且任务已可靠受理后返回，不等待 Hyper Client 确认。
- Unpublish 在 Publication 进入 `Unpublishing` 且任务已可靠受理后返回，不等待 Hyper Client 确认。
- Publication 状态变更与异步任务受理必须保持一致，不能出现状态已改变但任务会永久丢失的情况。

### 幂等与并发

- `Publishing` 或 `Published` 状态下重复 Publish，返回当前 Publication，不启动新任务。
- `Unpublishing` 或 `Unpublished` 状态下重复 Unpublish，返回当前 Publication，不启动新任务。
- `Publishing` 状态下拒绝 Unpublish。
- `Unpublishing` 状态下拒绝 Publish。
- 同一 Publication 同时最多有一个当前 PublicationOperation；一次操作包含它的有限自动重试。
- 只有与当前 PublicationOperation 匹配的 Hyper Client 确认可以改变状态。
- 旧操作的迟到确认仅记录日志；当前操作的重复成功确认幂等接受，不再次改变状态或状态时间。

### 失败与删除

- Publish 重试耗尽后进入 `Failed`。
- Unpublish 重试耗尽后回到 `Published` 并记录失败，用户可以再次 Unpublish。
- PublicationFailure 只保存当前尚未恢复的结构化失败摘要：失败动作、稳定错误码、安全描述、失败时间和尝试次数。
- Hyper Client 原始响应、技术异常和历史失败只进入日志。
- 后续 Publish 或 Unpublish 成功时清除 PublicationFailure。
- Publication 处于 `Publishing`、`Published`、`Unpublishing` 或 `Failed` 时禁止删除 Drive。
- 只有从未产生 Publication，或 Publication 已进入 `Unpublished` 时，Drive 才可删除。
- 删除 Drive 时一并删除 `Unpublished` Publication，不把它作为永久审计记录保留。

## 备选方案

### 将发布状态直接放在 Drive 上

此方案对象更少，但会把 Drive 的内容生命周期与外部发布流程耦合在一起，难以独立表达 Publication 身份、失败信息和异步操作，也容易让“创建 Drive”与“发布 Drive”再次混为一谈，因此不采用。

### 每次 Publish 都创建新的 Publication

此方案天然保留历史，但会产生同一 Drive 的多条发布关系，增加当前记录选择、幂等和并发仲裁的复杂度。Cinereel 当前不需要永久发布审计，因此不采用。

### 同步等待 Hyper Client 的最终结果

此方案对调用方直观，但会让请求持续时间受外部网络控制，无法稳健处理长耗时、有限重试和连接中断，也不能消除“操作已经成功但响应丢失”的不确定性，因此不采用。

### 不区分 PublicationOperation

仅按 Drive 或操作类型接受确认实现更简单，但迟到或乱序确认可能覆盖较新的用户意图，使 Publication 状态倒退，因此不采用。

## 后果

正面影响：

- Drive 与 Publish 的职责清晰，未来可分别演进。
- 状态机能够如实表达外部确认、失败和取消过程。
- 重复命令、重复确认和迟到确认都有确定语义。
- Drive 删除不会暗中触发 Unpublish，也不会在外部状态不确定时丢失本地依据。

代价与约束：

- 服务必须持久化 Publication、PublicationOperation 和当前 PublicationFailure。
- 服务必须提供可靠的异步任务受理、有限重试和确认关联能力。
- Hyper Client 交互必须携带或映射 PublicationOperation 身份。
- 调用方需要轮询 Publication，不能把 Publish 或 Unpublish 的首次响应视为最终成功。
