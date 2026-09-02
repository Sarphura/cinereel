# ADR-0007：使用 DriveManifest 传播 Drive 公开描述

- 状态：已接受
- 日期：2026-09-02

## 背景

Cinereel 使用 Hyperdrive 保存并复制 Drive 内容，同时使用 C# 服务中的 SQLite 保存当前实例的 Drive、访问关系、任务状态和其他领域状态。用户 A 创建并发布 Drive 后，用户 B 只能通过 `DriveKey` 加入对应 Hyperdrive；用户 A 的 SQLite 数据库不会随 Drive 一起复制，因此用户 B 无法从中获得 Drive 的规范 Name、内容类型和公开描述。

如果把这些公开描述只保存在 Hyper Client 的本地注册表中，信息仍然只属于用户 A 的当前设备，其他订阅者无法获取；Hyper Client 也会因此承担 Drive 领域模型和业务持久化职责。反之，如果把当前实例的全部 Drive 状态都写入 Hyperdrive，又会泄露私有备注和内部任务信息，并混淆“可复制内容”与“本地业务状态”。

因此需要明确 Drive 公开描述的传播载体、C# 数据库与 Hyperdrive 各自的权威范围，以及 Hyper Client 在该流程中的职责。

## 决策

- C# 服务的 SQLite 数据库是当前 Cinereel 实例本地领域状态的权威来源，保存 `DriveId`、`DriveKey` 映射、`RelationType`、`Status`、`Remark`、`IdempotencyKey`、Publication 和可靠异步操作状态。
- 每个可供其他实例订阅的 Drive 在 Hyperdrive 内保存一个版本化 JSON 文档，称为 `DriveManifest`。它是随 Drive 内容复制的公开描述，也是订阅方获得 Drive 规范信息的来源。
- `DriveManifest` 位于 Cinereel 协议保留的固定路径。具体路径、JSON Schema 和兼容性测试在实现 Spec 中定义；一旦发布，路径不得由单个实例自行配置或更改。
- `DriveManifest` 至少包含以下字段：
  - `schemaVersion`：Manifest Schema 版本。
  - `name`：发布者提供的 Drive 规范 Name。
  - `contentTypeId`：稳定的 `DriveContentTypeId`。
  - `description`：公开描述。
  - `createdAt`：Drive 公开描述的创建时间。
  - `updatedAt`：Drive 公开描述的最近更新时间。
- `DriveManifest` 不得包含本地 `DriveId`、`RelationType`、Subscription、`Remark`、Publication 或任务状态、扫描结果、错误信息、`IdempotencyKey` 以及其他仅属于当前实例的状态。
- 对于 DriveOwnership，用户 A 的 C# 数据库保存可编辑的规范信息。修改公开描述时，C# 服务先提交本地领域状态，再通过可靠异步操作把新的 `DriveManifest` 写入 Drive；两份数据采用最终一致性，不把跨 SQLite 与 Hyperdrive 的写入伪装成原子事务。
- Manifest 写入失败、重试和恢复状态只保存在用户 A 的 C# 数据库中，不写入 `DriveManifest`。只有成功写入 Drive 的版本才会传播给订阅者。
- 用户 B 建立 Subscription 时，C# 服务通过 Hyper Client 读取 `DriveManifest`，校验固定路径、大小、JSON 格式、`schemaVersion` 和必填字段，然后创建自己的本地 `DriveId` 与 Subscription，并缓存公开描述。订阅方不得采用 Manifest 中不存在的发布者本地 `DriveId`。
- 缺失、不受支持或无效的 `DriveManifest` 不足以建立 Cinereel Subscription；建立操作必须失败并返回可识别的协议错误。普通 Hyperdrive 可访问不等于它是可订阅的 Cinereel Drive。
- 用户 B 的 `Remark` 只保存在用户 B 的 SQLite 数据库中，用作本地显示覆盖，不得回写或传播到用户 A 的 `DriveManifest`。
- Hyper Client 是 Hyperdrive I/O Adapter，负责共享 SDK 生命周期、解析 Drive、读取与原子替换文件以及映射协议错误。它不解析 `DriveManifest` 的领域含义、不校验业务字段，也不持久化 Drive 业务注册表。
- C# Drive Module 拥有 `DriveManifest` 的序列化、校验、兼容性规则和发布/订阅编排。跨进程 Interface 传递文件内容或明确的 I/O 请求，不在 Hyper Client 中复制领域模型。

## 身份与可信度

Hyperdrive 的签名和版本验证可以证明收到的 `DriveManifest` 属于相应 Drive，且由持有该 Drive 写入密钥的一方写入。它不能单独证明该写入者在 Cinereel 之外的社会身份就是“用户 A”。

如果产品需要展示或验证发布者身份，必须另行定义经过签名的 `PublisherIdentity -> DriveKey` 关联及其信任、撤销和密钥轮换规则。该身份协议不属于 `DriveManifest` 的职责，也不在本 ADR 中决定。

## 数据流

### 发布者更新公开描述

1. 用户 A 向 C# 服务提交 Drive 公开描述变更。
2. C# 服务校验 DriveOwnership 和字段规则，在 SQLite 中提交新的规范信息及可靠异步操作。
3. 后台操作序列化新的 `DriveManifest`，通过 Hyper Client 原子替换 Drive 中的 Manifest 文件。
4. Hyperdrive 传播包含新 Manifest 的版本；写入失败时由 C# 服务记录并重试。

### 订阅者建立 Subscription

1. 用户 B 向 C# 服务提交 `DriveKey`。
2. C# 服务通过 Hyper Client 加入或读取对应 Drive，并取得固定路径的 `DriveManifest`。
3. C# 服务校验 Manifest；缺失或无效时不创建 Subscription。
4. 校验成功后，C# 服务分配本地 `DriveId`，保存 `DriveKey`、公开描述缓存和 `RelationType = Subscription`。
5. 用户 B 可以设置仅保存在本地的 `Remark`；后续同步 Manifest 时不得覆盖该 `Remark`。

## 备选方案

### 公开描述只保存在发布者的 C# 数据库

此方案只有一个本地权威来源，更新和事务处理最简单。

但用户 B 仅凭 `DriveKey` 无法访问用户 A 的数据库，需要额外的在线目录服务或发布者 HTTP Interface。它破坏 Hyperdrive 内容可独立复制和离线读取的能力，因此不采用。

### 公开描述保存在 Hyper Client 本地注册表

此方案可以复用 Hyper Client 的本地存储，并避免在 Drive 内容中增加协议文件。

但注册表不会随 Hyperdrive 复制，订阅者仍然无法取得描述；同时 Hyper Client 将拥有 Drive 领域字段、Schema 演进和业务持久化职责，形成低 Depth 的跨层重复，因此不采用。

### 所有 Drive 状态都保存在 DriveManifest

此方案可以减少 C# 数据库中的字段，让不同实例看到相同状态。

但 `DriveId`、Subscription、`Remark`、Publication、幂等墓碑和任务状态都属于单个 Cinereel 实例。传播这些状态既会泄露本地信息，也会让多个实例争夺同一份状态的写入权，因此不采用。

### 使用中心化目录保存并分发公开描述

此方案便于搜索、审核、身份认证和集中更新，也可以让订阅者在加入 Drive 前预览信息。

但它引入新的在线依赖、运营责任和可用性要求。Cinereel 当前首先需要让 Drive 自描述并随内容复制；未来可以建立目录索引 Manifest，但目录不能替代 Drive 内的 Manifest，因此本次不采用。

### 缺失 Manifest 时仍创建 Subscription

此方案兼容任意 Hyperdrive，并可使用占位 Name 等待后续补全。

但这种记录无法满足 Cinereel Drive 的必填 `DriveContentTypeId` 和规范 Name，不同调用方还会产生不一致的默认值。普通 Hyperdrive 与 Cinereel Drive 的协议语义应明确区分，因此不采用。

## 后果

正面影响：

- Drive 的公开描述与文件内容一起复制，订阅者无需访问发布者的 C# 数据库或 Hyper Client 本地状态。
- C# 数据库与 `DriveManifest` 的职责按“本地领域状态”和“公开可复制描述”分离，私有 `Remark` 与内部操作状态不会被传播。
- Hyper Client 保持为专注 Hyperdrive I/O 的 Adapter，不形成第二套 Drive 业务数据库或 Manifest 领域 Implementation。
- `schemaVersion` 为字段演进和旧客户端兼容提供显式依据。
- 订阅入口通过 Manifest 校验区分普通 Hyperdrive 与 Cinereel Drive，避免用占位数据建立不完整领域记录。

代价与约束：

- 公开描述同时存在于发布者 SQLite 和 Hyperdrive 中，需要可靠异步操作、重试、可观测状态和最终一致性处理。
- 用户 B 看到的是最近已复制并校验成功的 Manifest，可能暂时落后于用户 A 的本地修改。
- 订阅方需要缓存公开描述并设计后续刷新策略；刷新公开字段时必须保留本地 `Remark` 和关系状态。
- 已有但缺少 `DriveManifest` 的 Drive 不能直接建立 Subscription，需要发布者补写 Manifest 或经过显式迁移。
- Manifest 的固定路径、大小上限、JSON Schema、字段长度、时间格式、未知字段处理和 Schema 兼容范围必须在实现前通过 Spec 固定并测试。
- `DriveManifest` 证明的是 Drive 写入密钥控制权，不提供发布者社会身份认证；需要身份展示时必须增加独立签名协议。

本 ADR 延续 [ADR-0002](0002-separate-drive-id-from-drive-key.md) 的 `DriveId` 与 `DriveKey` 分离、[ADR-0003](0003-model-subscription-as-a-separate-relationship.md) 的规范 Name 与本地 `Remark` 分离，以及 [ADR-0006](0006-use-ef-core-with-sqlite-for-local-persistence.md) 对本地领域状态持久化的决策。
