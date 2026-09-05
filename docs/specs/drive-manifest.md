# DriveManifest 首版实现

- 状态：协议读写、公开描述更新、可靠同步与订阅缓存已实现；Publication 发布门槛与 Profile 身份协议尚未接通。
- 日期：2026-09-05
- 依据：[ADR-0007](../adr/0007-persist-public-drive-description-in-drive-manifest.md)、[ADR-0008](../adr/0008-model-drive-directories-as-path-prefixes.md)、[ADR-0009](../adr/0009-persist-publisher-profile-in-profile-drive.md)。

## 目标与已确定的职责

DriveManifest 是随 Drive 内容复制的公开描述。发布者通过本地领域用例更新它；订阅者先读取并校验它，再建立自己的本地 Drive 关系。

沿用已有 ADR 与本次设计讨论：

- 在 C# `Features/Drive` 内建立专门的 DriveManifest Module，封装文档读写与协议规则。
- C# 拥有字段语义、序列化、校验、兼容性、本地缓存与可靠异步编排。
- 继续使用 `IHyperClient` 表达文件 I/O；Hyper Client 负责实际存储、原子替换和协议保留路径保护。
- 发布者 SQLite 保存可编辑的公开描述及同步状态；订阅者 SQLite 保存最近一次有效的公开描述缓存。
- `DriveId`、`RelationType`、`Remark`、Publication、任务状态、错误信息和幂等键不进入 Manifest。
- 本次聚焦 DriveManifest。ProfileManifest 和 PublisherIdentity 的字段及身份验证遵循 ADR-0009，另行细化。

## 协议路径

固定 Drive 根目录下的 `/.cinereel/drive.json` 为 DriveManifest 路径，并整体保留 `/.cinereel` 及其后代路径。

这里是 Hyperdrive 内的协议路径，与 Hyper Client 本机 `CONFIG_DIR` 没有映射关系。首次写入协议文件即可形成目录投影，不创建空目录或目录标记。

- 路径按大小写敏感的规范绝对路径匹配；`/.cinereel-backup` 不属于该前缀。
- 用户目录列举在投影和分页前过滤协议 entry，协议文件不能使用户目录凭空出现。
- 普通文件读取、增加、删除和目录操作不能直接访问协议保留路径；拒绝结果应可识别。
- 删除用户根目录 `/` 只删除用户 entry，保留全部协议 entry，包括当前客户端尚不识别的协议文件。
- 后续移动、复制和导入操作遵守相同约束；不能通过源路径、目标路径或符号链接绕过保护。
- 协议 I/O 使用内部入口；Web 不获得任意路径或任意 JSON 的协议写入能力。
- 写入 Manifest 仍检查真实的 Drive 可写状态，并与同一 Drive 的普通文件 mutation 使用同一并发协调机制。
- 已有用户内容与保留路径冲突时必须报告并显式迁移，不自动覆盖或删除。

## 文档格式

文档使用 UTF-8 JSON 对象，大小上限为 64 KiB，字段名大小写敏感。首版只支持整数 `schemaVersion = 1`。

| 字段 | 首版规则 |
|---|---|
| `schemaVersion` | 必填整数，当前值为 `1` |
| `name` | 必填字符串，沿用 `DriveName.TryCreate`：Trim 后非空且不超过 200 个 UTF-16 code unit；写入规范化值 |
| `contentTypeId` | 必填字符串，必须是当前支持的 `DriveContentTypeId` |
| `description` | 必填纯文本字符串，允许空字符串，不超过 4,000 个 UTF-16 code unit；不是可执行标记 |
| `createdAt` | 必填 UTC 时间字符串，格式为 `yyyy-MM-dd'T'HH:mm:ss.fff'Z'`，表示公开描述的创建时间 |
| `updatedAt` | 必填同格式时间字符串，不早于 `createdAt`，随公开描述修改而更新 |

示例：

```json
{
  "schemaVersion": 1,
  "name": "电影收藏",
  "contentTypeId": "cinereel.movie",
  "description": "公开的电影收藏说明。",
  "createdAt": "2026-09-05T08:00:00.000Z",
  "updatedAt": "2026-09-05T08:00:00.000Z"
}
```

解析规则：

- 写入 UTF-8 无 BOM 文档；读取拒绝无效 UTF-8、BOM、注释、尾逗号、重复属性名和非法 JSON，最大嵌套深度为 16。
- 缺失必填字段、`null`、错误类型和越界字段均返回无效 Manifest，不补占位 Name 或默认内容类型。
- 对已支持 Schema 中的未知字段允许忽略，大小和嵌套限制仍覆盖整个文档；新增必填字段或改变既有语义需要升级 Schema。
- 读取时忽略未知字段不代表写入时可以丢弃它们。同步流程拒绝覆盖包含未知字段或不支持 Schema 的既有 Manifest，并返回可识别结果；后续如需保留扩展字段，必须另行定义完整读改写规则。
- 不支持的 `schemaVersion` 与格式损坏分开报告；遇到未知 `contentTypeId` 也明确报告不支持，不映射为 `cinereel.generic`。
- 写入由明确的公开字段构造，不直接序列化 `DriveEntity`。首版不输出发布者身份字段；后续按 ADR-0009 明确其格式与校验后接入，不将未知字段视为已验证身份。
- 时间戳用于展示与资料变化记录，不用作并发写入的顺序凭据；同步重试复用相同描述内容与时间戳。

## C# Module 与 I/O

内部使用 `IDriveManifestService` / `DriveManifestService`，模型使用 `DriveManifest`。读取与写入的 Result 分别定义。

- 读取操作接收 `DriveKey`，返回已经校验的 DriveManifest 及其实际读取版本，隐藏路径、JSON 和远程协议。
- 订阅初次读取不要求已有本地 `DriveId`；校验通过后才持久化本地 Drive 关系。
- 写入操作只供已经完成授权与可靠受理的内部用例调用，接收本次待同步的公开描述与读取时取得的 ETag；不自行修改 SQLite 或提交 Unit of Work。读取、检查可覆写性、条件写入由同步用例连续编排。
- 本地 `DriveId` 到 `DriveKey` 的解析、Ownership、生命周期和同步状态仍由应用用例负责。
- 扩展现有 `IHyperClient` 支持受限内容读取与原子替换。跨进程只传递文件内容和明确的 I/O 意图，不传递 DriveManifest 领域模型。
- Hyper Client 的读取固定文件版本；长度检查与正文读取属于同一次读取，实际正文流也必须受大小限制。
- 协议文件必须是普通文件，不跟随符号链接；对目录或符号链接明确报告无效目标。
- 替换成功后读者只能看到完整旧文档或完整新文档。不得用先删除再新增实现更新；失败或中断时不能留下半份 JSON。
- 写入成功、实际不可写、条件冲突、不支持覆写、目标冲突与结果未知分别表达。传输超时不等于写入未发生，必须通过读回或等价机制确认后继续收敛。

目录职责与类型组织见 `apps/service/NAMING.md`。

### HTTP 契约

| 入口 | 行为 |
|---|---|
| `GET /api/drives/{driveId}/description` | 读取本地公开描述、`revision`、`syncedRevision`、`syncStatus`、`errorCode` |
| `PUT /api/drives/{driveId}/description` | `{ name, description, expectedRevision }`；自有 Drive 才能更新，修订冲突返回 409，实际变更可靠受理返回 202，相同值返回 200 |
| `POST /api/drives/subscriptions` | `{ driveKey }`；校验后返回 201 与本地 DriveId，已有订阅返回 200，Ownership 或删除墓碑冲突返回 409 |
| `POST /api/drives/{driveId}/subscription/refresh` | 显式刷新已订阅的公开描述，失败保留缓存和 Remark |
| `DELETE /api/drives/{driveId}/subscription` | 清除本地关系与 Remark，返回 204，不删除 Drive 内容 |
| `GET /v1/protocol-files/{driveKey}?path=…` | 协议字节读取；200 携带强 ETag、`X-Drive-Version` 与 `application/octet-stream` |
| `PUT /v1/protocol-files/{driveKey}?path=…` | 至多 64 KiB 字节正文；`If-None-Match: *` 仅创建，或 `If-Match: <ETag>` 条件替换；成功 201/200，条件不匹配 412 |

协议 I/O 缺少写入条件返回 428，不可写返回 403，非普通文件或层级冲突返回 409，过大返回 413，读取不可用返回 503，超时返回 504。协议读取确认不存在返回 404；建立订阅时将缺失、无效、过大与不支持分别映射到带有稳定 `code` 的 422 ProblemDetails。

同步状态为 `pending`、`synced`、`failed`；订阅的公开描述为 `cached`，其本地同步修订均为 0，不冒充远端版本。修改内容类型仍需完整 DriveScan 用例，不由公开描述更新入口绕过。

## 读取结果

以下结果分别通过 Manifest ResultCode 和所属用例的 ProblemDetails 表达。

| 结果 | 调用方行为 |
|---|---|
| 读取成功 | 使用已校验的公开描述；建立订阅或刷新缓存 |
| 文件缺失 | 拒绝建立订阅，不解释为普通空配置 |
| 文档过大或无效 | 拒绝建立订阅，保留已有的有效缓存 |
| Schema 或内容类型不支持 | 返回可识别的不支持结果，不降级为默认值 |
| 内容暂不可用或等待超时 | 可重试；不能误报为文件缺失，不清空有效缓存 |
| 调用取消 | 传播取消，不记录为远端文档损坏 |

确认某个读取版本中没有该 entry 才能报告文件缺失。解析失败不能建立 Subscription；Profile 资料不可用则按 ADR-0009 独立处理，不使有效的内容 Subscription 失败。

## 可靠同步与首次写入

已有 ADR 确定更新采用最终一致性：公开描述与待同步状态在同一次 SQLite 提交中保存，后台读取待同步内容，通过 Hyper Client 写入后再记录成功。

实现必须保证：

- 进程重启可恢复待同步工作，不能只使用内存队列。
- 同一 Drive 的旧任务和迟到确认不能覆盖或确认更新的描述版本；本地描述版本、已同步版本与 Hyperdrive 读取版本分别表达。
- 超时可能意味着远端已经写入。每次尝试先读取当前文档和 ETag，再执行条件替换；同值读回也必须执行条件替换，推进远端 ETag 后才确认本地修订，防止尚在途的旧请求迟到覆盖。条件冲突保留待同步状态，下次重新读取。
- 重试使用同一份公开描述，避免为每次尝试重写 `updatedAt`。
- 同步成功只确认本次写入对应的版本；写入过程中有新修改时，新版本仍保持待同步。
- Drive 删除后不继续派发写入；已在途的写入与后续内容回收必须协调，不能由迟到确认恢复已删除关系。

首次写入采用方案 A：创建时保存初始公开描述与待同步修订，Hyperdrive 创建成功即可进入 `Ready`，Manifest 独立同步。初始 `description` 为空字符串，随后通过公开描述入口修改。

本地公开描述和同步修订保存在 `DriveEntity`；后台每 5 秒读取最多 100 个到期记录，单次同步最多等待 15 秒，失败按 5 秒起步的指数退避重试，上限 5 分钟。公开描述再次修改时清除旧退避。重启根据 SQLite 恢复，取消不记为协议失败。

当前 C# 应用按单进程访问本地 SQLite 的部署方式协调更新、同步与删除；同一自有 Drive 的修改可能等待当前同步尝试结束。跨进程迟到的 HTTP 写入通过 Hyper 的 ETag 条件拒绝。此机制不声明支持多个 C# 写入进程共享同一数据库或多个独立发布者同时编辑同一 Drive。

迁移为既有自有 Drive 设置初始待同步修订，保留创建状态、IdempotencyKey 和 Remark；公开描述时间初始取本地创建时间。遇到协议路径冲突或不兼容文档时保留原文件并记录错误。

首次发布必须等待所需公开描述版本成功同步。当前 Publication 仍是独立的占位用例，本次没有把 Manifest 同步成功表示成发布成功；发布门槛随该用例实现时接入。

## 分步实现与验收

1. 文档模型测试覆盖固定样例、字段限制、坏 JSON、非法 Unicode、重复属性及兼容规则。
2. Hyper 真实存储与 HTTP 测试覆盖条件并发、ABA、大小上限、中断上传、根目录删除保护和路径冲突。
3. C# Client 测试覆盖请求条件头、版本与 ETag 校验、实际正文上限、取消和错误映射。
4. 同步与迁移测试覆盖创建 `Ready` 独立性、既有数据补写、重启恢复、响应丢失、同值修订的迟到写入、退避与取消。
5. 订阅测试覆盖初次读取、重复建立、取消和恢复、刷新失败保留缓存与 Remark，以及禁止修改订阅公开描述。

每步完成后分别核对行为与调用链。协议 I/O、解析完成不等于发布订阅业务已经完成；实现进度另在能力矩阵中如实记录。
