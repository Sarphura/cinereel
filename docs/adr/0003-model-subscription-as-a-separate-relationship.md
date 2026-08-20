# ADR-0003：将 Subscription 建模为独立关系

- 状态：已接受
- 日期：2026-08-19

## 背景

Cinereel 既能创建并控制可写的 Drive，也能通过 Hyperdrive 公钥访问已有 Drive。现有 Web 前端使用 `isLocal` 区分两类记录，并把本地 Drive 与订阅 Drive 合并为同一种列表项。

如果把 `Local` 或 `Subscribed` 直接建模为 Drive 的类型或状态，Drive 这个数据集合本身就会混入“当前 Cinereel 如何获得访问权”的关系信息。删除订阅、改变访问方式或从多个视角查询同一个 Drive 时，类型与生命周期语义会变得含混。

因此需要明确：Subscription 和可写控制能力是 Drive 自身的类型或状态，还是当前 Cinereel 与 Drive 之间的独立关系。

## 决策

- Drive 表示拥有独立 `DriveId` 并关联 Hyperdrive 内容的数据集合，自身不区分 `Local` 或 `Subscribed`。
- DriveOwnership 表示当前 Cinereel 对 Drive 持有可写控制能力的关系，并在当前 Cinereel 创建 Drive 时建立。
- Subscription 是当前 Cinereel 与一个已有 Drive 建立的访问关系，并通过 `DriveId` 引用 Drive。
- DriveOwnership 与 Subscription 均通过 `DriveId` 引用 Drive，不是 Drive 的类型或状态。
- 同一 Drive 的 DriveOwnership 与 Subscription 互斥；已有其中一种关系时，建立另一种关系必须返回冲突。
- 不通过自动删除 Subscription、自动转移 Ownership 或查询投影合并来处理关系冲突。
- Drive 保存规范 Name；只有持有 DriveOwnership 才能修改 Name。
- DriveOwnership 与 Subscription 各自可以保存当前 Cinereel 私有的可选 Remark。
- Remark 不修改或发布 Drive 的规范 Name；查询投影使用 Remark 作为本地显示覆盖，没有 Remark 时显示 Name。
- 从外部建立 Subscription 时可以接收 `DriveKey`，但 `DriveKey` 只用于找到对应内容；关系建立后仍以 `DriveId` 引用 Drive。
- 创建 Drive 与建立 Subscription 是不同动作，不使用一个带类型参数的通用创建动作表达二者。
- 只有持有 DriveOwnership，当前 Cinereel 才能修改 Drive 内容、Publish 或删除 Drive。
- 删除 Subscription 只结束访问关系，不等同于删除 Drive，也不隐式触发 Drive 删除。
- Publish 根据 DriveOwnership 判断资格，不根据 `isLocal`、`IsWritable` 或 Hyper Client 的即时状态判断。
- 同时展示可写 Drive 与 Subscription 所引用 Drive 的列表属于查询投影，不改变 Drive 和 Subscription 各自的模型。
- 没有 DriveOwnership、Subscription、Publication 或其他持久化关系引用的 Drive 是 OrphanedDrive。
- 删除最后一个关系只使 Drive 满足 OrphanedDrive 条件；关系删除事务不同时删除 Drive。
- 删除最后一个关系的事务提交后，OrphanedDrive 立即具备回收资格，不设置固定或可配置的宽限期。
- 独立异步回收流程负责删除 OrphanedDrive 记录和对应的本地缓存，并在真正删除前重新确认该 Drive 仍然没有任何引用。
- 回收执行前若建立了新的关系，该 Drive 不再满足 OrphanedDrive 条件，回收不得继续。

## 备选方案

### 在 Drive 上保存 Local 或 Subscribed 类型

此方案与现有前端的 `isLocal` 字段接近，列表查询和条件渲染都很直接。

但类型实际描述的是当前 Cinereel 与 Drive 的关系，而不是 Drive 本身。关系变化会被误写成 Drive 状态迁移，也难以表达统一身份下的不同访问来源，因此不采用。

### 在 Drive 上保存 IsWritable

此方案不需要额外的 DriveOwnership 关系，写入和 Publish 资格可以直接读取 Drive 字段。

但可写能力描述的是当前 Cinereel 对 Drive 的控制关系，而不是 Drive 固有属性；它与把 Subscription 保存成 Drive 类型存在相同的建模问题，因此不采用。

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

- Drive 的定义只描述数据集合，DriveOwnership 与 Subscription 分别描述可写控制关系和订阅访问关系，职责清晰。
- 两种关系互斥，列表、权限与删除规则不需要处理双重资格。
- Subscription 删除与 Drive 回收解耦，不会在关系命令中隐藏资源删除副作用。
- OrphanedDrive 不等待宽限期，系统可以及时释放本地资源。
- 删除 Subscription、查询 Drive 和判断 Publish 资格不会依赖含混的 `isLocal` 标志。
- 文件树、预览和媒体索引等能力可以围绕统一的 Drive 身份复用。
- Web 前端仍可获得合并列表，但 `isLocal` 只能是查询投影，不是领域字段。
- 规范 Name 与本地 Remark 分离，发布者更新和本地显示偏好不会相互覆盖。

代价与约束：

- 持久化层需要分别保存 Drive、DriveOwnership 与 Subscription，并维护它们的引用完整性。
- 持久化事务必须保证同一 `DriveId` 不会同时关联 DriveOwnership 与 Subscription。
- 创建 Drive 时必须一致地建立 Drive 与 DriveOwnership，不能留下无法控制的半成品记录。
- 建立 Subscription 时需要把外部 `DriveKey` 解析为现有或新登记的 Drive。
- 查询列表时需要组合 Drive、可写资格和 Subscription 关系，不能只读取一张带类型字段的表。
- 查询投影需要组合 Drive.Name 与当前关系的 Remark 才能得到显示名称。
- 系统需要可靠调度 OrphanedDrive 回收，并处理失败重试与进程重启恢复。
- 回收与新关系建立可能并发，删除前的引用检查和最终删除必须避免误删重新被引用的 Drive。
- 回收完成后再次订阅相同 `DriveKey` 会建立新的 Drive，并获得新的 `DriveId`。
