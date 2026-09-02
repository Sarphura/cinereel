# ADR-0008：将 Drive 目录建模为路径前缀投影

- 状态：已接受
- 日期：2026-09-02

## 背景

Cinereel 使用 Hyperdrive 保存 Drive 文件。Hyperdrive 的 metadata core 按完整路径记录文件或符号链接，文件内容保存在 Hyperblobs 中；`list(path)` 按路径前缀列举后代 entry，`readdir(path)` 从后代 entry 中推导当前层的子项。Hyperdrive 不要求在写入 `/movies/action/a.mp4` 前创建 `/movies` 或 `/movies/action`，也没有独立的普通目录 entry 或 `mkdir` 操作。

Web 文件浏览器需要显示根目录、子目录和文件，并提供文件增加、列举、删除、移动和复制等操作。如果 Cinereel 另行持久化目录 Entity，或者仿照部分对象存储控制台写入零字节目录标记，就会在 Hyperdrive 的原生路径索引之外形成第二套目录状态。两套状态需要处理同步、复制、删除和冲突恢复，但不能增加真实文件能力。

目录模型还必须解决扁平 key 空间允许、文件系统界面却无法正确表达的冲突。例如 `/movies` 与 `/movies/a.mp4` 可以作为两个不同 key 存在，但前者在界面中必须同时是文件和目录。仅检查目标完整路径是否已经存在，不能阻止这种冲突；仅按完整路径串行化写入，也不能阻止 `/movies` 与 `/movies/a.mp4` 被并发创建。

因此需要明确 Drive 目录的存在语义、文件与目录的路径不变量、跨进程 Interface，以及 C# 服务、Hyper Client 和 Web 各自的职责。

## 决策

### 目录语义

- Drive 的用户文件空间仍然是以规范绝对路径为 key 的扁平集合。普通目录不是持久化对象、Hyperdrive entry、C# Entity 或 Repository 记录。
- 除根目录外，一个目录当且仅当至少存在一个用户可见文件或符号链接以 `目录路径 + "/"` 为前缀时存在。目录节点由列举操作动态投影。
- 根目录 `/` 始终作为合成目录节点存在，即使 Drive 尚无任何用户文件。
- Cinereel 不支持空目录，不写入以 `/` 结尾的零字节目录标记，也不使用 `.keep`、隐藏占位文件或 Manifest 字段保留空目录。
- 增加第一个后代文件时，其所有父目录自动出现；删除目录中的最后一个后代文件时，该目录自动消失。两种变化都不产生独立目录写入。
- [ADR-0007](0007-persist-public-drive-description-in-drive-manifest.md) 定义的 `DriveManifest` 及其他 Cinereel 协议保留路径不属于用户文件空间。列举用户目录时必须过滤这些 entry，用户文件操作也不得写入、移动到、复制到或删除协议保留路径。只有协议 Implementation 可以访问这些路径。

### 路径不变量

- 用户文件路径使用以 `/` 开头的规范绝对路径。文件路径不得以 `/` 结尾，不得包含空 segment、`.`、`..`、反斜杠或控制字符；长度限制由跨进程协议统一定义。
- 文件和符号链接都是叶节点。对于任意叶节点路径 `p`：
  - `p` 不得已经存在其他 entry，除非具体用例明确采用替换语义；默认增加文件不覆盖。
  - `p` 的每个祖先路径都不得是文件或符号链接。
  - 不得存在以 `p + "/"` 为前缀的用户 entry。
- 上述规则禁止 `/a` 与 `/a/b` 同时存在，也禁止在已有合成目录 `/a` 上增加同名文件。
- 路径校验、祖先检查、后代检查和最终写入必须处于同一个 Hyper Client 侧临界区。当前单 Hyper Client 进程模型按 `DriveKey` 串行化 mutation；只按完整路径加锁不能保证层级不变量。
- 如果未来允许多个持有同一写入密钥的进程同时修改 Drive，进程内锁不再充分，必须先增加跨写入者协调或基于版本的冲突检测。本 ADR 不把当前单进程假设扩展为多写入者保证。

### 列举 Interface

- Drive File Module 对调用方提供“列举某个目录的直接子项”这一小型 Interface，隐藏 Hyperdrive 的 prefix range、stream、entry 结构和目录合成算法。
- Hyper Client Adapter 使用 Hyperdrive 的浅层前缀列举能力读取直接子项。真实 entry 映射为文件或符号链接；只有更深后代、当前层没有同名叶节点时才合成目录节点。
- 列举结果必须区分真实叶节点与合成目录节点，不得把 `directory` 伪装成 Hyperdrive entry 的原生 `value.type`。
- 列举结果携带对应的 `drive.version`。需要分页时，游标必须绑定 Drive 版本；版本变化后不得把新旧版本的页面拼成一个看似一致的目录结果。
- C# 对 Web 暴露按目录读取的应用 Interface，Web 按展开状态懒加载子目录。默认读取不构造或传输整个 Drive 的递归树。
- 复制尚未完成时，读取 Interface 必须如实返回等待、超时或内容暂不可用等结果，不得把读取失败降级成空目录。

示意调用链如下：

```text
Web Explorer
  -> C# Drive File Interface（DriveId、权限与业务结果）
  -> IHyperClient（DriveKey、目录路径、版本/游标）
  -> Hyper Client Adapter
  -> Hyperdrive readdir/list/entry
```

这一 Seam 让调用方只理解目录路径、直接子项和版本，不需要理解 Hyperbee 与 Hyperblobs。目录投影与层级冲突检查集中在拥有真实存储状态的 Hyper Client 中，从而保持 Locality。

### mutation 语义

- 增加文件只写入目标文件 entry 和 blob，不显式创建父目录。
- 删除单个文件只删除该叶节点。删除后是否还有对应目录由剩余 key 自然决定。
- “创建目录”不是受支持的用例。HTTP Adapter 和 Web 不应提供一个看似成功但没有持久效果的命令；界面中不得展示创建空目录操作。
- 删除目录表示删除该前缀下的全部用户 entry；移动或复制目录表示枚举并处理该前缀下的全部用户 entry。它们的时间与空间成本至少为 `O(n)`，其中 `n` 是后代叶节点数，不得作为常量时间的目录元数据修改实现或描述。
- 递归 mutation 必须在固定 Drive 版本上确定输入集合，并与同一 Drive 的其他 mutation 协调。操作规模、是否进入异步任务、失败恢复和结果报告在具体用例 Spec 中定义；不得通过逐项 HTTP 调用后忽略部分失败来伪装成原子操作。
- Hyperdrive `batch()` 是否用于提交一组 metadata 修改属于 Hyper Client Implementation 细节，不改变递归操作需要枚举全部后代及处理 blob 的事实。

### 职责分配

- C# Drive Module 负责 `DriveId`、DriveOwnership、`Ready` 生命周期检查、用户用例、可靠异步任务、业务结果及 HTTP 映射。
- `IHyperClient` 是 C# 到 Hyper Client 进程的外部 Seam。它传递 `DriveKey` 和文件 I/O 意图，不暴露 Hyperdrive、Hyperbee、Hyperblobs 或 Node stream 类型，也不为目录建立独立 `IHyperDirectoryClient`。
- Hyper Client 负责 SDK 生命周期、Drive 解析、真实 I/O、协议保留路径保护、版本读取、目录投影，以及保持路径不变量所需的原子检查与进程内串行化。
- Web 只消费应用 Interface 返回的文件和合成目录节点，不自行从全量文件列表重复实现目录合成规则，也不把读取错误显示为空树。
- 文件与目录共享同一 key 空间和同一组层级不变量，因此保留在一个 Drive File Module 内，不新增独立 Directory Module、Directory Entity 或 Directory Repository Seam。

## 备选方案

### 持久化独立目录 Entity

此方案可以直接表达空目录，并让重命名目录看起来像修改一条记录。

但目录 Entity 与 Hyperdrive 的文件 key 会形成两套权威状态。文件复制到其他实例后还需要同步目录数据库；文件写入、目录删除与恢复也会引入跨 SQLite 和 Hyperdrive 的一致性问题，因此不采用。

### 使用零字节目录标记

此方案与部分 S3 控制台的行为相似，可以在扁平 key 空间中保留空目录。

但 Cinereel 已确认不需要空目录。目录标记会占用用户路径、混入扫描和文件计数，并要求所有列举、下载、移动和删除操作识别特殊 entry，因此不采用。

### 把完整文件树保存到 DriveManifest

此方案允许订阅者读取一个 JSON 文件后直接显示完整树，也可以存储空目录。

但文件树是 Hyperdrive entry 的派生结果，额外快照会在每次文件 mutation 后失效。大型 Drive 还会反复重写 Manifest，并把协议公开描述与高频文件索引混为一体，因此不采用。

### 允许文件与目录同名

此方案最接近完全不施加约束的扁平 key 存储，也允许 `/a` 与 `/a/b` 独立存在。

但 Web Explorer、路径导航、递归删除和本地文件系统导入都无法稳定解释同一个名称究竟是叶节点还是目录。不同调用方会被迫自行选择优先级，破坏 Interface 一致性，因此不采用。

### 每次返回完整递归树

此方案让 Web 实现简单，只需一次请求即可渲染全部内容。

但读取成本、响应大小和首屏延迟随 Drive 总文件数增长；分页和版本一致性也更难表达。按目录懒加载能保持小型 Interface，并直接复用 Hyperdrive 的浅层列举能力，因此不采用。

## 后果

正面影响：

- 目录状态只有一个来源：Hyperdrive 中真实存在的用户文件 key。
- 增加文件不需要创建父目录，删除最后一个文件也不需要清理目录记录。
- C# 数据库不增加 Directory Entity、migration、Repository 或同步任务。
- Hyper Client 集中隐藏前缀扫描、目录合成、Drive 版本和层级并发，调用方获得稳定且较小的 Interface。
- Web 可以按需读取大型 Drive，不需要一次加载完整文件树。
- 协议保留文件不会泄露为用户可见目录，也不会参与普通媒体扫描和文件操作。

代价与约束：

- 无法创建或保留空目录，删除最后一个后代文件会使目录立即消失。
- 目录节点没有独立创建时间、修改时间、权限或 metadata；需要这些能力时必须重新评估是否引入显式目录协议。
- 目录移动、复制和删除都是前缀下的批量操作，成本随文件数增长，可能需要可靠异步任务。
- 文件增加必须检查祖先和后代路径，并按 Drive 串行化 mutation；并发度低于只按完整路径加锁。
- 分页读取需要绑定 `drive.version`，复制延迟和版本变化必须成为可观察结果。
- 当前 Web 中的创建目录操作与读取失败回退为空树的行为不符合本 ADR，相关实现需要在后续文件能力工作中移除或调整。

## 实现验证要求

后续实现至少覆盖以下测试：

- 写入 `/a/b.mp4` 后，根目录列举得到合成目录 `/a`，列举 `/a` 得到文件 `/a/b.mp4`。
- 空 Drive 只返回合成根目录，不返回普通子目录；协议保留文件不出现在用户目录中。
- 删除 `/a` 中最后一个文件后，根目录不再返回 `/a`。
- 已有文件 `/a` 时拒绝写入 `/a/b`；已有 `/a/b` 时拒绝写入文件 `/a`。
- 并发写入 `/a` 与 `/a/b` 时最多一个成功，最终状态始终满足层级不变量。
- 相同目标的默认增加操作保持不覆盖语义。
- 列举分页不会跨不同 `drive.version` 静默拼接。
- Hyperdrive 读取失败、等待和超时不会被映射为空目录。
- Web 不显示创建空目录命令，并按展开状态懒加载直接子项。

本 ADR 延续 [ADR-0002](0002-separate-drive-id-from-drive-key.md) 的 `DriveId` 与 `DriveKey` 分离，以及 [ADR-0007](0007-persist-public-drive-description-in-drive-manifest.md) 对 C# 领域状态、可复制协议数据和 Hyper Client I/O 职责的划分。
