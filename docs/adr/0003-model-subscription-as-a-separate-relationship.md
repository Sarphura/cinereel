# ADR-0003：使用 RelationType 建模 Drive 访问关系

- 状态：已接受
- 日期：2026-08-19
- 修订：2026-08-23

## 背景

Cinereel 既能创建并控制可写的 Drive，也能通过 Hyperdrive 公钥访问已有 Drive。现有 Web 前端使用 `isLocal` 区分两类记录，并把本地 Drive 与订阅 Drive 合并为同一种列表项。

`Local` 或 `Subscribed` 不是 Drive 的内容类型，而是“当前 Cinereel 如何获得访问权”的关系信息。但当前模型中同一个 Drive 最多只有一种本地访问关系，为每种关系建立独立 Entity、Repository 和表会增加查询拼接与持久化样板。

因此需要同时明确关系语义和持久化方式：调用方仍使用 DriveOwnership 与 Subscription 描述能力，但持久化层使用 Drive 上的单一分类字段表达当前关系。

## 决策

- Drive 表示拥有独立 `DriveId` 并关联 Hyperdrive 内容的数据集合；`RelationType` 描述当前 Cinereel 与它的关系，不是 Drive 的内容类型。
- `DriveRelationType` 显式定义 `None = 0`、`Ownership = 1` 与 `Subscription = 2`。
- DriveOwnership 表示当前 Cinereel 对 Drive 持有可写控制能力，对应 `RelationType = Ownership`，并在当前 Cinereel 创建 Drive 时建立。
- Subscription 是当前 Cinereel 与一个已有 Drive 建立的访问关系，对应 `RelationType = Subscription`。
- DriveOwnership 与 Subscription 不建立独立 Entity、Repository 或表；`RelationType` 的单值结构保证二者互斥。
- 已有 Ownership 或 Subscription 时，建立另一种关系必须返回冲突。
- 不通过自动删除 Subscription、自动转移 Ownership 或查询投影合并来处理关系冲突。
- Drive 保存规范 Name；只有持有 DriveOwnership 才能修改 Name。
- Drive 使用 `Remark` 保存当前 RelationType 对应的私有备注；`RelationType` 变为 `None` 时必须清空 Remark。
- Remark 不修改或发布 Drive 的规范 Name；查询结果使用 Remark 作为本地显示覆盖，没有 Remark 时显示 Name。
- 从外部建立 Subscription 时可以接收 `DriveKey`，但 `DriveKey` 只用于找到对应内容；关系建立后仍以 `DriveId` 引用 Drive。
- 创建 Drive 与建立 Subscription 是不同动作，不使用一个带类型参数的通用创建动作表达二者。
- 只有持有 DriveOwnership，当前 Cinereel 才能修改 Drive 内容、Publish 或删除 Drive。
- 删除 Subscription 会把 `RelationType` 设为 `None` 并清空 Remark，不等同于删除 Drive，也不隐式触发 Drive 删除。
- Publish 根据 DriveOwnership 判断资格，不根据 `isLocal`、`IsWritable` 或 Hyper Client 的即时状态判断。
- 同时展示 Ownership 与 Subscription Drive 的列表直接筛选 `RelationType != None`。
- `RelationType = None` 且没有 Publication 或其他持久化关系引用的 Drive 是 OrphanedDrive。
- 清除最后一个关系只使 Drive 满足 OrphanedDrive 条件；关系清除事务不同时删除 Drive。
- 删除最后一个关系的事务提交后，OrphanedDrive 立即具备回收资格，不设置固定或可配置的宽限期。
- 独立异步回收流程负责删除 OrphanedDrive 记录和对应的本地缓存，并在真正删除前重新确认该 Drive 仍然没有任何引用。
- 回收执行前若建立了新的关系，该 Drive 不再满足 OrphanedDrive 条件，回收不得继续。

## 备选方案

### 为 DriveOwnership 与 Subscription 建立独立表

此方案让关系存在性、关系字段和关系生命周期在物理模型中完全独立，删除一行即可表达解除关系。

但当前同一个 Drive 最多只有一种本地访问关系，独立表需要额外的 Entity、Repository、Configuration 和查询拼接，却没有提供额外能力。当前使用一个包含 `None` 的关系状态即可表达等价信息，因此不采用。

### 在 Drive 上保存 IsOwnership

此方案只需一个布尔字段，写入和 Publish 资格可以直接读取 Drive。

但 `false` 无法区分 Subscription 与没有任何关系，不能覆盖三种互斥状态，因此不采用。

### 每次向 Hyper Client 查询私钥状态

此方案无需持久化 DriveOwnership，可以把 Hyper Client 是否持有写入能力视为事实来源。

但领域规则会依赖远程技术状态；Hyper Client 不可用时无法可靠判断 Publish 和删除资格，也无法在同一事务中维护跨 Feature 约束，因此不采用。

### 允许 DriveOwnership 与 Subscription 共存

此方案把两种关系完全独立处理，也允许当前 Cinereel 订阅自己拥有的 Drive。

但同一 Drive 会同时出现在可写与订阅查询中，删除、Publish 资格和列表投影都要处理双重关系，而且自我订阅没有新增领域能力，因此不采用。

### 建立 DriveOwnership 时自动删除 Subscription

此方案可以把订阅 Drive 平滑转换为可写 Drive，调用方不需要先显式删除 Subscription。

但建立一种关系会隐式删除另一种关系，使失败恢复和用户意图难以判断；当前也没有已定义的 Ownership 转移流程，因此不采用。

### 把所有名称保存在关系上

此方案允许每个 Cinereel 实例独立命名同一个 Drive，Drive 本身不需要保存名称。

但 Drive 在发布和跨实例交换时没有规范名称，调用方也无法区分发布者名称与本地备注，因此不采用。

### Drive Name 创建后不可修改

此方案让发布出去的名称永远稳定，本地重命名只需修改 Remark。

但名称录入错误后无法修正，发布者也不能合理更新 Drive 的规范描述，因此不采用。

### 永久保留 OrphanedDrive

此方案可以在再次订阅相同 `DriveKey` 时复用原 `DriveId`，也不需要异步回收机制。

但失去所有关系的 Drive 记录和本地缓存会持续累积，系统无法回收已不再使用的资源，因此不采用。

### 只允许显式清理 OrphanedDrive

此方案不会在后台自动删除记录，清理时机完全由用户或管理员控制。

但 OrphanedDrive 是内部关系变化产生的派生事实，不应要求用户理解或维护；遗漏清理仍会造成无限累积，因此不采用。

### 为 OrphanedDrive 设置固定宽限期

此方案允许短期内重新建立 Subscription 时复用原 `DriveId`，并减少反复订阅造成的资源抖动。

但它需要额外的时间状态和延迟调度规则；删除关系后已经没有用户可见能力需要保留该身份，因此不采用。

### 使用可配置宽限期

此方案允许部署者在身份复用与资源回收速度之间自行权衡。

但宽限期会扩大配置、测试和运维表面，并让不同实例具有不同的身份保留语义，因此不采用。

### 为本地内容和订阅内容建立两种实体

此方案能彻底隔离创建、删除和权限规则，每种实体的行为都较单纯。

但两者都需要文件树、预览、媒体索引和 DriveKey 解析能力，会形成两套高度相似的 Interface 与 Implementation，并让跨 Feature 引用难以共享统一的 `DriveId`，因此不采用。

## 后果

正面影响：

- `RelationType` 用一个字段完整表达无关系、可写控制和订阅访问三种互斥状态。
- 两种关系由单值分类天然互斥，列表、权限与删除规则不需要处理双重资格。
- Subscription 删除与 Drive 回收解耦，不会在关系命令中隐藏资源删除副作用。
- OrphanedDrive 不等待宽限期，系统可以及时释放本地资源。
- 删除 Subscription、查询 Drive 和判断 Publish 资格不会依赖含混的 `isLocal` 标志。
- 文件树、预览和媒体索引等能力可以围绕统一的 Drive 身份复用。
- Web 前端直接获得合并列表，`RelationType` 仍表示关系而不是 Drive 内容类型。
- 规范 Name 与本地 Remark 分离，发布者更新和本地显示偏好不会相互覆盖。
- 删除独立 Ownership Repository Seam 后，Drive 查询和关系更新集中在同一处，减少持久化样板并提高 Locality。

代价与约束：

- Drive 行同时保存当前实例的关系字段，不再从物理结构上隔离 Drive 元数据与关系数据。
- 创建 Drive 时必须把 `RelationType` 一致地设为 `Ownership`，不能留下无法控制的半成品记录。
- 建立 Subscription 时需要把外部 `DriveKey` 解析为现有或新登记的 Drive。
- 关系切换必须显式维护 `RelationType` 与 Remark，避免 `None` 状态残留私有备注。
- 如果未来允许一个 Drive 同时拥有多种关系或每种关系拥有独立生命周期，必须重新拆分关系实体与表。
- 系统需要可靠调度 OrphanedDrive 回收，并处理失败重试与进程重启恢复。
- 回收与新关系建立可能并发，删除前的引用检查和最终删除必须避免误删重新被引用的 Drive。
- 回收完成后再次订阅相同 `DriveKey` 会建立新的 Drive，并获得新的 `DriveId`。
