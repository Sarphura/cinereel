# Cinereel 三端能力总览

- 盘点日期：2026-09-05
- 对应基线：`8fd69fe`，另包含本次 Hyper Client 离线任务实现
- 范围：Web 前端 `apps/web`、C# 后端 `apps/service`、Hyper Client `apps/hyper-client`
- 文档性质：当前实现状态快照，不替代 [领域术语](../CONTEXT.md)、[后端规范](../apps/service/NAMING.md) 或 [ADR](adr/)。

目前已完成 Drive 基础管理、后端与 Client 的文件基础操作，以及 Hyper Client 的正文传输和离线缓存任务。C# 尚未接入正文和离线任务 Interface，前端文件管理、发布订阅、媒体库等链路还没有打通。

## 判定口径

- ✅：该层已有可执行实现，或前端已正确接入当前后端契约；不表示整个产品链路均已完成。
- ❌：接口缺失、实现占位、契约不兼容，或尚不能提供该项保证。
- 不涉及：该层不负责此项能力，不代表该层需要补充实现。
- `*`：基础操作已实现，但有已确认的行为限制，见“已知限制”。
- 前端 ✅ 以 API 地址配置正确为前提。仅有页面、菜单、DTO、Service 方法或底层 SDK 能力，不等于已有可用接口。
- 本文基于源码盘点和此前的专项验证，不是当前运行实例的在线探活结果。

## 三端能力矩阵

| 能力 | 前端 | C# 后端 | Hyper Client | 当前状态 |
|---|:---:|:---:|:---:|---|
| 创建 Drive、选择初始内容类型 | ✅ | ✅ | ✅ | 后端异步创建，支持幂等键；内容类型由 C# 保存 |
| Drive 列表 | ✅ | ✅ | ✅ | 前端本地 Drive 列表已接入；Client 列的是 SDK 中的 Drive |
| 创建状态展示、失败重试 | ✅ | ✅ | 不涉及 | Pending / Ready / Failed |
| 编辑自有 Drive 备注 | ✅ | ✅ | 不涉及 | 备注保存在 SQLite |
| 删除自有 Drive 记录 | ✅ | ✅ | 不涉及 | 逻辑删除，保留幂等墓碑 |
| 可靠清理 Drive 全部本地存储 | ❌ | ❌ | ❌ | Client 有尽力清理接口，但不保证成功 |
| 重命名 Drive、编辑公开描述 | ❌ | ✅ | ✅ | C# 公开描述用例要求 expectedRevision，SQLite 可靠受理后同步 Manifest |
| 修改已有 Drive 内容类型 | ❌ | ❌ | 不涉及 | 目前只能创建时选择 |
| 添加、刷新、取消订阅及订阅备注 | ❌ | ✅ | ✅ | 按 DriveKey 校验 Manifest 后建立本地关系；前端仍调用旧订阅 API |
| 订阅列表 | ❌ | ✅ | 不涉及 | 后端返回已有订阅记录；前端解析格式不兼容 |
| 发布、取消发布、发布状态 | ❌ | ❌ | ❌ | 后端有路由，但 Service 尚未实现；Client 没有可靠发布确认接口 |
| 加入、退出 Swarm | ❌ | ❌ | ✅ | Client 的 mount / unmount；不等于产品的发布订阅 |
| 浏览目录直接子项 | ❌ | ✅* | ✅* | 前端仍请求旧 `/tree`，未接新分页接口 |
| 上传新增文件 | ❌ | ✅* | ✅* | 流式上传，最大 500 MiB，默认不覆盖 |
| 删除单个文件 | ❌ | ✅ | ✅ | 前端 `path` 传参位置错误 |
| 递归删除目录 | ❌ | ✅ | ✅ | 前端没有正确区分文件、目录删除接口；Client 逐项删除，不保证原子性 |
| 用户文件覆盖更新 | ❌ | ❌ | ❌ | 普通文件 PUT 只有新增语义；协议文件另有条件替换 Interface |
| 文件、目录重命名／移动／复制 | ❌ | ❌ | ❌ | 前端有交互，但接口不存在 |
| 创建空目录 | ❌ | ❌ | ❌ | 领域设计明确不支持；前端仍残留入口 |
| 文件读取、HTTP 下载、原文件媒体预览／播放 | ❌ | ❌ | ✅ | Client 支持 GET、HEAD、单段 Range、附件与固定版本；仅传输原文件，不转码 |
| 单文件／目录／整盘离线缓存任务 | ❌ | ❌ | ✅ | Client 提供持久化任务、进度、暂停／继续／取消／重试与重启恢复；缓存到 Corestore |
| 本地目录导入、手动电影挂载 | ❌ | ❌ | ❌ | 前端弹窗仍调用旧 `/api/mount` |
| DriveManifest、协议保留路径保护 | ❌ | ✅ | ✅ | 固定 /.cinereel/drive.json；C# 解析与持久化重试，Hyper 受限读取和条件替换；普通文件操作隔离协议目录 |
| DriveManifest 发布者引用、PublisherIdentity | ❌ | ❌ | ❌ | 设计见 [ADR-0009](adr/0009-persist-publisher-profile-in-profile-drive.md)，尚未实现 |
| 媒体扫描、索引、任务进度 | ❌ | ❌ | 不涉及 | 前端任务面板依赖旧接口 |
| 电影资料库 | ❌ | ❌ | 不涉及 | 有卡片页面，缺少数据接口与完整交互 |
| Profile Drive、个人资料、头像 | ❌ | ❌ | ❌ | 有 Profile Drive 编辑页面和部分前端契约，缺少后端、协议和公开主页实现 |
| 仪表盘、剧集、音乐、下载独立页面 | ❌ | ❌ | 不涉及 | 当前为占位页面 |
| 系统、版本信息 | ❌ | ✅ | ✅ | 后端与 Client 各有诊断接口 |

## 实际接口清单

`{driveId}` 是 Cinereel 的 DriveId，`{driveKey}` 是 Hyperdrive 的 DriveKey，二者不能互换。目录列举接口还支持可选的 `cursor` 和 `limit`；C# 的 Web 游标与 Hyper Client 的子项名称游标不是同一种格式。

| 接口能力 | C# 后端 | Hyper Client |
|---|---|---|
| 创建 Drive | ✅ `POST /api/drives` | ✅ `POST /v1/drives` |
| Drive 列表 | ✅ `GET /api/drives` | ✅ `GET /v1/drives` |
| 单个 Drive 查询 | ✅ `GET /api/drives/{driveId}` | ❌ 未暴露 REST 接口 |
| 删除 Drive | ✅ `DELETE /api/drives/{driveId}`，逻辑删除 | ✅ `DELETE /v1/drives/{driveKey}`，尽力清理 |
| 创建失败重试 | ✅ `POST /api/drives/{driveId}/creation/retry` | 不涉及 |
| 更新备注 | ✅ `PUT /api/drives/{driveId}/remark` | 不涉及 |
| 读取／更新公开描述及同步状态 | ✅ `GET/PUT /api/drives/{driveId}/description` | 不涉及 |
| 协议文件读取／条件替换 | C# 内部 `IDriveManifestService` | ✅ `GET/PUT /v1/protocol-files/{driveKey}?path=…` |
| 建立订阅 | ✅ `POST /api/drives/subscriptions` | 复用协议文件读取 |
| 刷新订阅公开描述 | ✅ `POST /api/drives/{driveId}/subscription/refresh` | 复用协议文件读取 |
| 取消订阅 | ✅ `DELETE /api/drives/{driveId}/subscription` | 不涉及 |
| 加入 Swarm | ❌ | ✅ `POST /v1/drives/{driveKey}/mount` |
| 退出 Swarm | ❌ | ✅ `POST /v1/drives/{driveKey}/unmount` |
| 列举目录 | ✅* `GET /api/drives/{driveId}/files/entries?path=…` | ✅* `GET /v1/files/{driveKey}/entries?path=…` |
| 新增文件 | ✅* `PUT /api/drives/{driveId}/files?path=…` | ✅* `PUT /v1/files/{driveKey}?path=…` |
| 删除文件 | ✅ `DELETE /api/drives/{driveId}/files?path=…` | ✅ `DELETE /v1/files/{driveKey}?path=…` |
| 删除目录 | ✅ `DELETE /api/drives/{driveId}/files/entries?path=…` | ✅ `DELETE /v1/files/{driveKey}/entries?path=…` |
| 文件读取／下载 | ❌ | ✅ `GET /v1/files/{driveKey}?path=…`，支持 `disposition`、`driveVersion`、Range 与 If-Range |
| 文件元数据 | ❌ | ✅ `HEAD /v1/files/{driveKey}?path=…`，不读取正文 |
| 创建离线缓存任务 | ❌ | ✅ `POST /v1/downloads`，要求 `Idempotency-Key` |
| 离线任务列表／详情 | ❌ | ✅ `GET /v1/downloads`、`GET /v1/downloads/{taskId}` |
| 离线任务控制 | ❌ | ✅ `POST /v1/downloads/{taskId}/pause`、`resume`、`cancel`、`retry` |
| 发布状态 | ❌ `GET /api/drives/{driveId}/publication`，占位 | ❌ |
| 发布 | ❌ `POST /api/drives/{driveId}/publication/publish`，占位 | ❌ |
| 取消发布 | ❌ `POST /api/drives/{driveId}/publication/unpublish`，占位 | ❌ |
| 系统诊断 | ✅ `GET /api/system-info` | ✅ `GET /healthz`、`GET /v1/version` |

新增文件请求正文为 `application/octet-stream`。C# 创建 Drive 还要求 `Idempotency-Key` 请求头，以及包含 `name`、`contentTypeId` 的 JSON 正文。

开发环境还提供接口文档：C# 使用 `/swagger`、`/swagger/v1/swagger.json` 和 `/openapi/v1.json`；Hyper Client 使用 `/docs`。这些文档入口不计入业务能力。

## 已知限制

### 开发地址配置尚未对齐

[Web 代理](../apps/web/vite.config.ts)默认把 `/api` 转发到 `localhost:3000`，而 [Hyper Client](../apps/hyper-client/src/main.ts)默认也监听 `3000`。[C# 配置](../apps/service/appsettings.json)又将该地址作为 Hyper Client 地址。前端 `/api` 应指向 C# 服务，需要为三端明确配置各自地址。

### 前端界面与现有接口存在断点

[前端文件 API](../apps/web/src/features/publish/api/api.ts)仍请求 `/tree` 和 `/refresh`，失败后显示空树；删除文件把 `path` 放在 JSON 正文，当前后端要求 query，目录删除还需要单独使用 `/files/entries`。上传正文尚未接入。

[订阅 API](../apps/web/src/features/subscriptions/api.ts)把 `GET /api/drives` 的返回值按 `{ data: [] }` 读取，当前 C# 返回的是直接数组，因此列表也未接通。`/publish` 页面目前主要管理自有 Drive 和本地目录挂载，并未实现 Publication 发布操作。

### 文件模型的完整保证尚未实现

[Hyper 文件实现](../apps/hyper-client/src/hyper.implementation/file.service.ts)存在此前已复现的问题：

- 写入 `/parent` 和 `/parent/child` 都能成功，导致父路径显示为文件，子文件无法正常展开。现有写锁内缺少祖先与后代路径冲突检查。
- 目录枚举期间发生写入时，可能将旧列表标记为新版本。两页版本号相同，拼接后仍可能遗漏新文件或保留已删文件。
- `/.cinereel` 已整体保留；协议 entry 不进入普通目录、直接读取或离线文件枚举，删除用户根目录时保留协议内容。
- 递归目录删除逐项执行，失败时可能已删除部分内容；删除 entry 也不等于立即回收历史 blob 占用。

路径与分页应满足的目标约束见 [ADR-0008](adr/0008-model-drive-directories-as-path-prefixes.md)。

### 媒体直读与离线缓存的边界

Hyper Client 返回原文件字节，支持 MIME、HEAD、Range 与固定版本；浏览器是否能播放取决于原文件容器和编码。旧 Web 视频组件期待的转码输出尚未实现，C# 也尚无正文代理 Interface。

离线任务缓存普通文件的数据块，根目录任务排除 `/.cinereel` 协议目录，不导出普通目录。进度是处理的内容字节，包含已有缓存；恢复时当前文件进度可能回退。任务固定版本且不自动跟踪源端后续变化，取消和暂停不清块；完成记录不保证显式清理之后缓存仍然存在。

文件操作以及排队、运行、暂停的任务会阻止 Drive 卸载／删除／清理测试，返回 `409`。本期未增加自动缓存淘汰、配额或可靠空间回收。具体契约见 [Hyper Client README](../apps/hyper-client/README.md) 与 [ADR-0010](adr/0010-stream-files-and-persist-offline-download-tasks.md)。

### 发布与存储清理尚未形成完整流程

[PublishService](../apps/service/Features/Drive/Service/PublishService.cs)的查询、发布、取消发布三个方法均抛出 `NotImplementedException`。

### Profile Drive 与发布者身份尚未形成完整流程

Profile Drive 和个人资料编辑页面目前只有前端草稿，后端没有对应 Feature、持久化模型或发布流程。订阅 API 虽预留 `ownerProfileKey`，但尚未读取、校验或展示远端 ProfileManifest。

发布 Drive 的跨节点引用必须使用 `publisherId` 与 `profileDriveKey`，不能使用发布者本地 `DriveId`。ProfileManifest、PublisherIdentity、签名、Key 轮换、撤销和资料缓存策略见 [ADR-0009](adr/0009-persist-publisher-profile-in-profile-drive.md)。

[Hyper Drive 实现](../apps/hyper-client/src/hyper.implementation/drives.service.ts)的 mount / unmount 只控制 Swarm 加入、退出与 Drive 关闭，不建立 Cinereel Subscription 或 Publication。前端“挂载本地目录”又是另一项用例，不能因名称相同而视为已接通。

C# 删除 Drive 只写入逻辑删除状态。Client 删除接口会尝试清理本地块，但清理失败仍可能返回成功，因此不保证释放全部本地存储。

## 验证范围

- 本次能力盘点只读检查了三端源码及接口注册，没有启动三端进行完整在线验收。
- Hyper Client 读取与离线任务另行执行了 `test`、`typecheck`、`build`。真实双节点通过本地复制连接验证 Range 字节、完整哈希、缓存后重启断网读取、旧版本任务，以及部分缓存任务暂停／重启／恢复网络继续；未以此宣称公网 DHT 穿透或三端联通已完成。
- Chrome 已验证通过真实 HTTP 上传与读取的 MP4、MP3 和 PNG：音视频实际播放、seek 到 7.25 秒并收到 `206`；桌面和移动视口检查通过。PDF 已验证 MIME、完整和范围字节契约，尚未验证浏览器内置 PDF 阅读器。
- 此前标准 C# 构建、测试在依赖还原阶段被 `SQLitePCLRaw.lib.e_sqlite3` 的 `NU1903` 漏洞告警阻断。
- DriveManifest 实现另行通过 262 项 C# 测试（验证命令使用 `-p:NuGetAudit=false`，没有修改依赖审计配置），当前 Hyper 全量 129 项测试通过。真实 Hyperdrive 协议测试覆盖条件并发、大小限制、中断上传和保留目录隔离。
- 两个独立临时 SQLite 的 C# 进程与真实 Hyper SDK 完成 21 项 HTTP 检查：创建与同步、连续公开描述更新、按 Key 订阅和刷新、保留 Remark、订阅只读、删除用户根目录后保留 Manifest。验证禁用 Swarm 发现，不代表公网复制或 Web 已接通；未修改用户数据库。
- 仅为验证命令添加 `-p:NuGetAudit=false` 后，构建成功，136 项 C# 测试全部通过；没有修改仓库审计配置。该结果不表示依赖漏洞已解决。
- 此前使用真实 Hyperdrive 复现了路径层级冲突和分页一致性问题，并验证了真实 HTTP 的基本流式上传与 EOF 后响应超时。
- 现有 C# 端点测试替换了 `IHyperClient`，不能凭测试全部通过推断三端功能已经打通。

## 更新方式

新增或调整能力时，同时检查前端调用契约、C# 路由及 Service 实现、Hyper Client 路由及存储行为。更新对应状态、已知限制、验证范围，以及文档顶部的日期和提交；仅增加 DTO、占位路由或 UI 入口时不应改为 ✅。
