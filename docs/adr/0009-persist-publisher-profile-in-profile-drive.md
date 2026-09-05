# ADR-0009：使用 Profile Drive 传播发布者资料

- 状态：已接受
- 日期：2026-09-05

## 背景

Cinereel 需要在订阅 Drive 时展示发布者的名称、头像、简介和可选的主页装饰，使发布者拥有类似 Steam 的个人主页。个人资料必须能够随发布者迁移或被多个订阅者读取，不能只保存在发布者当前实例的 SQLite 或 Web 前端状态中。

当前 Drive 模型区分本地 `DriveId` 与 Hyperdrive 的 `DriveKey`。`DriveId` 是当前 Cinereel 实例分配的本地 Guid，订阅者不能解析发布者数据库中的这个值。Hyperdrive 的签名能够证明某个 Drive 的写入控制权，但不能单独证明写入者对应某个稳定的社会身份。

[ADR-0007](0007-persist-public-drive-description-in-drive-manifest.md) 已决定使用随 Drive 复制的 `DriveManifest` 传播公开描述，并把发布者身份关联留给独立协议。本 ADR 定义该身份关联和 Profile Drive 的传播方式。

## 决策

### Profile Drive

- 每个发布者身份拥有一个公开的 Profile Drive。当前单节点单账号部署中，可以按每个节点一个 Profile Drive 实现；未来多账号部署必须按发布者身份分别创建。
- Profile Drive 是普通的 DriveOwnership，使用固定的 ProfileManifest 保存公开资料。它不保存当前实例的订阅关系、私有备注、任务状态或其他本地领域状态。
- Profile Drive 必须按照 Publication 生命周期发布并保持可读取；取消 Profile Drive 的 Publication 只影响资料展示，不自动取消内容 Drive 的 Subscription。
- 当前 DriveContentTypeId 仍使用 `cinereel.generic`；ProfileManifest 的固定协议路径负责标识 Profile Drive 的语义。只有在未来需要独立扫描或内容类型展示行为时，才另行增加 `cinereel.profile` 类型决策。
- ProfileManifest 至少包含 `schemaVersion`、`publisherId`、`displayName`、`bio`、`avatarPath`、`updatedAt`。主页装饰使用声明式 JSON、白名单组件或受限 Markdown 表达。
- PublisherIdentity 文档与 ProfileManifest 一同写入 Profile Drive 的固定协议保留路径。它声明 `publisherId` 与当前 `profileDriveKey` 的签名绑定，并包含版本、撤销和轮换所需的元数据。
- 头像和装饰资源作为 Profile Drive 中的公开文件保存。协议必须限制文件大小、MIME 类型、路径和总资源量。
- Profile Drive 可以包含已发布 Drive 的索引，但该索引只是公开展示用的可变投影，不是 Publication 状态的权威来源。发布列表需要从发布 Drive 或当前实例的 Publication 查询中重新校验。

### 跨节点引用

发布 Drive 的 `DriveManifest` 可以包含以下发布者引用：

- `publisherId`：稳定的发布者身份标识，使用可验证的公钥指纹或其他版本化身份格式。
- `profileDriveKey`：当前 Profile Drive 的 Hyperdrive 公钥，用于发现和读取资料。

发布 Drive 不得写入发布者本地的 `DriveId` 或 `profileDriveId`。订阅者读取发布 Drive 后，必须使用自己的 SQLite 分配新的本地 `DriveId`，并把 `publisherId` 与 `profileDriveKey` 作为外部协议数据缓存。

`profileDriveKey` 只承担内容定位职责。`publisherId` 到 Profile Drive 的绑定、签名、信任、撤销和密钥轮换由独立的 PublisherIdentity 文档定义；Profile Drive 更换底层 Key 时，不得要求所有发布 Drive 同时改写其 Manifest。

### 订阅与展示流程

1. 发布者创建或恢复唯一的 Profile Drive，写入经过版本化的 ProfileManifest。
2. 发布者发布内容 Drive 时，在该 Drive 的 `DriveManifest` 写入 `publisherId` 和 `profileDriveKey`。
3. 订阅者先按 ADR-0007 校验内容 Drive 的 `DriveManifest`，再从 Profile Drive 的固定路径读取 PublisherIdentity 和 ProfileManifest，校验两份文档中的 `publisherId`、`profileDriveKey`、版本和签名关系。
4. 订阅者把公开资料缓存到本地 Drive 关系或专用缓存中，保留自己的 `Remark` 和关系状态。
5. Profile Drive 暂时不可用、资料版本落后或已被删除时，内容 Subscription 仍可成立；界面显示最近一次有效缓存或资料不可用状态。
6. 发布者更新头像、简介或装饰时，只更新 Profile Drive。订阅者按版本或 `updatedAt` 刷新缓存，不要求重写所有内容 Drive。

### 身份可信度

Hyperdrive 的 Drive 签名只能证明 Manifest 由对应 Drive 的写入密钥控制者写入。要防止他人复制某个 `profileDriveKey` 冒充发布者，PublisherIdentity 必须签名声明发布者身份与当前 Profile Drive 的绑定，并定义：

- 身份首次建立和信任来源；
- Profile Drive Key 的轮换和旧 Key 的撤销；
- 发布 Drive 与 `publisherId` 的绑定签名；
- 身份文档版本、过期时间和订阅者的兼容策略。

在身份协议实现前，产品可以把 `profileDriveKey` 作为未验证的资料来源展示，但不得把它标记为经过认证的用户身份。

### 安全边界

- Profile Drive 的内容默认公开，个人资料接口不得把私密账号信息写入其中。
- Web 端不得直接执行远端 HTML、JavaScript、样式表或组件代码。装饰只能从受限 Schema 渲染。
- 头像读取必须检查内容类型、大小和解码结果；远端资源加载需要遵守应用的缓存和错误回退策略。
- 删除或取消发布 Profile Drive 不应自动删除发布 Drive；相关身份撤销和资料不可用状态由订阅者根据 PublisherIdentity 处理。

## 备选方案

### 在每个发布 Drive 中复制完整个人资料

该方案可以让订阅者只读取一个 Drive 就显示资料，但头像和简介每次更新都要改写所有发布 Drive，容易产生版本不一致和存储膨胀。发布者资料与内容 Drive 的生命周期也会被强耦合，因此不采用。

### 在发布 Drive 中保存本地 `DriveId`

该方案写入成本低，但 Guid 只在发布者的 SQLite 中有意义，订阅者无法解析，且违反 DriveId 与 DriveKey 的职责分离，因此不采用。

### 只保存 `profileDriveKey`，不定义稳定身份

该方案适合最小可用版本，但无法可靠处理 Profile Drive Key 轮换，也不能证明多个发布 Drive 属于同一发布者。可以作为身份协议落地前的兼容阶段，不作为最终协议。

### 使用中心化个人主页服务

该方案便于搜索、审核和身份认证，但会引入在线依赖和新的可用性边界。Cinereel 当前需要先让资料随 Drive 复制，因此中心化目录不能替代 Profile Drive。

## 后果

正面影响：

- 发布者资料拥有单一的可复制来源，更新不需要扩散到所有内容 Drive。
- 订阅者可以离线使用最近一次有效的资料缓存。
- `DriveId`、`DriveKey` 和发布者身份各自承担明确职责，避免跨节点误用本地标识。
- Profile Drive 可以承载头像、主页装饰和合集索引，支持逐步扩展个人主页能力。

代价与约束：

- 需要定义 ProfileManifest、PublisherIdentity、固定协议路径和 Schema 兼容规则。
- 需要实现 Profile Drive 的唯一性、可靠更新、缓存刷新、Key 轮换和撤销处理。
- 资料展示是最终一致的；订阅者可能暂时看到旧资料或无法取得资料。
- 发布、订阅和 Profile 展示需要跨 Drive 的编排，但 Hyper Client 仍只负责文件 I/O，不承担身份领域逻辑。
- 当前的 Profile 前端、Publication 和 DriveManifest 都尚未完整接通，不能仅凭 UI 或 DTO 视为已实现。

## 实施顺序

1. 固定 PublisherIdentity、ProfileManifest、DriveManifest 发布者字段、协议保留路径和签名规则。
2. 实现 Profile Drive 的创建、唯一性约束、资料更新和公开资源校验。
3. 实现 DriveManifest 的发布者引用，补充订阅时的资料读取与本地缓存。
4. 增加公开个人主页、订阅 Drive 的发布者入口和资料刷新状态。
5. 最后实现 Key 轮换、撤销、离线缓存恢复和装饰 Schema 的兼容演进。
