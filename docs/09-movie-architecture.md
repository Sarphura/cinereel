# Movie 模块项目架构

> 适用对象：要重构 / 新建 / 迁移 publish、subscribe、download 等业务模块的同学。
> 文档目的：把 `apps/service/src/modules/movie/` 当作"参考实现"，提取**可复用的分层约定**与**要小心的 trade-off**。
> 与电影识别规则相关的细节见 [08-movie-scanning.md](./08-movie-scanning.md)；本文专注**代码组织、模块边界、数据流**。

## 1. 为什么把 movie 当作参考实现

Movie 模块是 service 中**最完整**的业务模块范例：

- 第一次把"业务模块"完整地拆成 **controller / service / service/scan / repository / domain** 五层
- 第一次把"无类型 JSON 存储"换成 **drizzle + SQLite + JSON 列**
- 第一次把"业务侧扫描"拆成 **纯函数 + IO 适配器**，使单元测试无须 mock Hyperdrive
- 第一次让 controller 用**显式 `Promise<{ data: T }>`** 类型注解代替裸 `Promise<object>`

publish / subscribe / download 这三个老模块当前都还是**单文件 service + JSON store** 形态。后续要往 movie 模式靠拢时，按本文档 §6 的迁移清单对照即可。

---

## 2. 目录结构（真实路径）

```
apps/service/src/modules/movie/
├── index.ts                       # 模块 barrel export（外部消费方从这里 import）
├── movie.module.ts                # NestJS @Module 定义
├── controller/
│   └── movies.controller.ts       # HTTP 层：GET /api/movies, POST /api/movies/refresh
├── service/
│   ├── movies.service.ts          # 业务编排：聚合 + 懒扫描 + 写库
│   └── scan/                      # 扫描子模块（纯函数 + IO 适配器）
│       ├── constants.ts           #   视频扩展名、海报候选、NFO 候选构造
│       ├── validators.ts          #   路径合法性校验（NestJS 异常）
│       ├── list-movie-folders.util.ts  # 纯函数：从 drive 条目识别电影目录
│       ├── list-movie-folders.util.spec.ts
│       ├── scan-movie.util.ts     # 核心：扫一个目录 → MovieRecordDto（含 Pure + IO 两个版本）
│       ├── scan-movie.util.spec.ts
│       └── io.ts                  # MovieFolderScanIO 接口 + hyperdriveScanIO 适配器
├── repository/
│   ├── movie.schema.ts            # drizzle schema + DDL bootstrap SQL
│   ├── movie.entity.ts            # 从 schema 推导的数据库行类型（InferSelectModel）
│   ├── movie.repository.ts        # 数据访问：upsertMany / findAll / findByDriveKey / deleteByDriveKey
│   └── movie.repository.spec.ts
└── domain/
    └── dto/
        └── movie.dto.ts           # MovieRecordDto（业务运行时）+ MovieResponseDto（HTTP 响应）
```

注意：

- **没有 `domain/entity/` 目录**：早期版本曾有 `domain/entity/{movie.schema,entity,repository}.ts`，但实际装配走的是 `repository/`，旧文件未删除干净（stale）。**新增代码请走 `repository/`**。
- `service/scan/` 是一个**子命名空间**，物理上属于 service 层的一部分，而不是平行层；它解决"扫描逻辑需要可测试 + 可换 IO 后端"的问题。

---

## 3. 分层职责与调用链

### 3.1 五层职责表

| 层 | 路径 | 输入 | 输出 | 不应感知 |
|----|------|------|------|---------|
| Controller | `controller/*.ts` | HTTP request (DTO) | `Promise<{ data: ResponseDto }>` | 数据库、Hyperdrive、网络细节 |
| Service | `service/*.service.ts` | 上层调用 + repository + 跨模块 service | 业务对象（domain DTO） | HTTP 协议细节、NestJS 装饰器 |
| Service/Scan | `service/scan/*.util.ts` | drive 条目 / IO 接口 | `MovieRecordDto`（运行时） | 数据库、NestJS 模块系统 |
| Repository | `repository/*.repository.ts` | 业务对象 | 数据库行（`MovieEntity`） | HTTP、NestJS 控制器、业务编排 |
| Domain | `domain/dto/*.dto.ts` | — | 类型定义 | 实现 |

### 3.2 数据流：一次"列出所有电影"

```
HTTP GET /api/movies
  │
  ▼
MoviesController.listMovies()                        [controller/movies.controller.ts]
  │  return Promise<{ data: MovieResponseDto[] }>
  ▼
MoviesService.listMovies()                           [service/movies.service.ts:50]
  │  1. driveRepo.findAll().filter(r => r.type === 'movie')
  │  2. 对每个 movie drive：
  │     - movieRepo.findByDriveKey(driveKey)  → 缓存命中则直接返回
  │     - 否则 scanDrive()  → upsertMany()  → 返回新扫描结果
  ▼
MoviesService.scanDrive(driveKey, isLocal)           [service/movies.service.ts]
  │  1. driveService.resolveDrive()  → Hyperdrive 实例
  │  2. drive.list('/', { wait: !isLocal })
  │  3. listMovieFolders(entries)                  ← 纯函数
  │  4. 对每个文件夹：scanMovieFolder(io, ...)     ← 走 IO 接口
  ▼
scanMovieFolderPure(entries, driveKey, folderPath)  [service/scan/scan-movie.util.ts]
  │  纯函数：从 entries 推断 posterPath / nfoPath
  ▼
scanMovieFolder(io, pure, driveKey, folderPath)       [service/scan/scan-movie.util.ts]
  │  1. parseMovieNfo(io.readNfo(nfoPath))         ← IO 抽象
  │  2. 组装 MovieRecordDto
  ▼
MovieRepository.upsertMany(records, indexedAt)      [repository/movie.repository.ts]
  │  SQL：INSERT OR REPLACE movies + 替换 movie_actors
  ▼
SQLite (movies.db, ${cacheDir}/movies.db)            [SqliteClient + MOVIES_BOOTSTRAP_SQL]
```

### 3.3 反向：刷新

```
HTTP POST /api/movies/refresh
  │
  ▼
MoviesService.refreshMovies()                       [service/movies.service.ts:84]
  │  1. deleteByDriveKey(driveKey)  // 对每个 movie drive
  │  2. 同 listMovies() 的扫描流程
```

**关键不变量**：业务代码不直接 `SQL`，全部走 `MovieRepository`。

---

## 4. 跨模块依赖图

### 4.1 出向依赖（movie 模块依赖谁）

```
MovieModule
  ├── DriveBaseModule      — DriveQueryService（base/drive 模块，目录条目读取）
  ├── SwarmModule          — （预留，挂远端时通过它解析）
  ├── ProfileModule        — （ownerProfileKey 在 DriveRecord 中读取，不强耦合）
  └── PublishModule        — DriveRepository（drive 元数据）+ DriveService（解析 drive 实例）
```

NestJS 允许 service 通过 type import 引用其他模块的 service；module 层只需要把被依赖模块列在 `imports` 里。详见 `movie.module.ts`。

### 4.2 入向依赖（谁在调用 movie 模块）

- **publish 模块**：通过 `MoviesService.invalidateDrive(driveKey)` 在 drive 删除 / 重新挂载时**主动通知 movie 模块清缓存**（见 `drive.service.ts`）。
- **外部**：HTTP 端 `/api/movies` 与 `/api/movies/refresh`，由前端 `apps/web/src/features/movies/api.ts` 消费。
- **NFO 解析器**：`@/modules/common/utils/movie-nfo.parser.ts` 写在 `common/`，publish 模块**也复用**它（不只是 movie 私有）。

### 4.3 跨模块通信：单向 import + 事件总线

模块间不允许互相 import（避免循环）。跨模块通信统一走 `DriveEventsEmitter`：

```
AppModule
  ├── CommonModule        ← 提供 DriveEventsEmitter
  ├── PublishModule       ← CommonModule
  ├── MovieModule         ← CommonModule + PublishModule
  ├── SubscribeModule     ← PublishModule + ProfileModule + CommonModule
  └── DownloadModule
```

依赖图是**有向无环**：Publish 不 import Movie，Movie 不 import Publish，事件通过 Common 提供的 emitter 转发。

**反向通信示例（drive 删除时通知 movie 清理缓存）**：

```
DriveService.delete(driveKey)                      [publish/service/drive.service.ts]
  │ driveEvents.emit('drive.deleted', { driveKey, isLocal, deletedAt })
  ▼
MoviesService.onModuleInit                          [movie/service/movies.service.ts]
  │ driveEvents.on('drive.deleted', ({ driveKey }) => invalidateDrive(driveKey))
```

事件定义集中在 `common/events/drive-events.types.ts` 的 `DriveEventMap`，加新事件时只改这一处。所有订阅方在 `on()` 处自动获得 payload 类型补全。

### 4.4 反向依赖历史（仅供阅读时参考）

在引入事件总线之前，`MoviesService.invalidateDrive` 公开方法由 `DriveService` 直接调用，形成循环。两侧都用 `forwardRef` 救场但容易漏（漏了 movie 端的 `@Inject(forwardRef(...))` 就会报 `UnknownDependenciesException`）。**新代码不允许再用 forwardRef 救循环**——遇到时引入事件而非 lazy resolve。

---

## 5. 数据模型

### 5.1 Schema（`repository/movie.schema.ts`）

两张表，业务主键复合 `(drive_key, resource_path)`：

```
movies
  drive_key        TEXT NOT NULL
  resource_path    TEXT NOT NULL   ← PRIMARY KEY（与 drive_key 一起）
  folder_name      TEXT NOT NULL
  indexed_at       INTEGER NOT NULL
  created_at       INTEGER NOT NULL
  updated_at       INTEGER NOT NULL
  title            TEXT               ← NFO 元数据，可空
  original_title   TEXT
  plot             TEXT
  year             INTEGER
  premiered        TEXT
  rating           REAL              ← 浮点存原始评分（如 7.61）
  tagline / runtime / studio / mpaa / fanart_path TEXT
  imdb_id / tmdb_id / collection / release_date TEXT
  poster_path / nfo_path TEXT
  genres / directors / writers / countries / tags TEXT  ← JSON 序列化 string[]
  PRIMARY KEY (drive_key, resource_path)

movie_actors
  movie_drive_key   TEXT NOT NULL   ← FK → movies
  movie_resource_path TEXT NOT NULL
  name              TEXT NOT NULL
  role / type / thumb TEXT
  sort_order        INTEGER NOT NULL
  PRIMARY KEY (movie_drive_key, movie_resource_path, sort_order, name)
  FOREIGN KEY (movie_drive_key, movie_resource_path)
    REFERENCES movies(drive_key, resource_path) ON DELETE CASCADE
```

**JSON 列用 `customType` 包装**（drizzle 的 `text()` 列 + 自定义 `dataType()/toDriver()/fromDriver()`），而不是简单 `.$type<string[]>()`。原因：`.map()` 在写入时把 `string[]` 序列化为 JSON、读取时反序列化；`.$type()` 只改 TS 端类型不会动 SQLite 端。详见 `movie.schema.ts:11-27`。

**重要约束**：所有元数据字段都是 nullable（`text()` 不带 `.notNull()`）。这意味着 `InferSelectModel` 推导出的字段类型是 **`T | null`（必填 nullable）**，**不是** `T | undefined`。后续写 entity mapper 时要按这个语义处理（参考 `movies.service.ts:144` 的 `Partial<MovieEntity> as MovieEntity` 模式）。

### 5.2 Entity（`repository/movie.entity.ts`）

```ts
export type MovieEntity = InferSelectModel<typeof movies>
export type MovieActorEntity = InferSelectModel<typeof movieActors>

export interface MovieWithActors {
  movie: MovieEntity
  actors: MovieActor[]
}
```

**Entity 不手写**——`InferSelectModel` 从 drizzle schema 自动推导。好处：

- schema 加字段时 entity 自动跟上，**不会出现"漏改"**的 bug
- schema 改类型时 entity 类型同步收紧
- **schema 是 single source of truth**

迁移约定：凡是用 drizzle 的模块，entity 全部走 `InferSelectModel`，不手写 `interface`。

### 5.3 DTO 三态对照

| 类型 | 来源 | 关注点 | nullable 语义 |
|------|------|--------|---------------|
| `MovieRecordDto` | `domain/dto/movie.dto.ts` | 运行时业务对象（scan 产出、service 间传递） | 元数据字段全部可选 `?:` |
| `MovieEntity` | `repository/movie.entity.ts` | 数据库行（drizzle 推导） | 元数据字段 `T \| null`（必填 nullable） |
| `MovieResponseDto` | `domain/dto/movie.dto.ts` | HTTP 响应（web 端消费） | 与 `MovieRecordDto` 一致但**只暴露当前 web 实际使用的字段** |

**转换规则**：repository ↔ DTO 在 `service/movies.service.ts` 的 `toMovieWithActors` / `toMovieRecordDto` 两个纯函数里完成；DTO ↔ HTTP DTO 在 `domain/dto/movie.dto.ts` 的 `toMovieResponse` 完成。**两个边界各做一次**。

---

## 6. Scan 子模块：纯函数 + IO 适配器

这是 movie 模块**最值得复用的设计模式**。

### 6.1 接口边界

```ts
// service/scan/scan-movie.util.ts
export interface MovieFolderScanIO {
  listEntries(prefix: string): Promise<HyperdriveEntry[]>    // 失败 → []
  readNfo(path: string): Promise<Buffer | null>               // 失败 → null
}
```

**IO 接口只暴露"读取"，不暴露"写入"**——这是**单向数据流**。扫描是只读操作，不应该污染存储。

### 6.2 三个实现

1. **`scanMovieFolderPure(entries, driveKey, folderPath)`**：纯函数，输入条目列表，输出 `ScannedMovieMetadata`（poster/nfo 路径）。无任何 IO，单元测试无须 mock。
2. **`scanMovieFolder(io, pure, ...)`**：纯函数 + IO 接口，输入元数据 + IO，输出 `MovieRecordDto`。同样无副作用，单测可注入 fake IO。
3. **`hyperdriveScanIO(drive)`**：把 `Hyperdrive` 实例适配成 `MovieFolderScanIO`。**失败一律返回安全值**（空数组 / null），保证扫描流程不会因单次 IO 错误中断。

### 6.3 可复用的约定

- **IO 接口命名空间**：放在 `service/scan/io.ts`，与"纯函数"放同包，便于阅读。
- **IO 失败兜底**：默认 `try/catch → 安全值`，**不要让 IO 异常冒泡到 service 层**——否则上游要写大量 try/catch。
- **纯函数 + IO 接口 = 可测试**：单测只测纯函数，IO 用 fake。集成测才用真实 `hyperdriveScanIO`。
- **`scanMovieFolderPure` 命名约定**：`*Pure` 后缀标识纯函数。
- **`hyperdriveScanIO` 命名约定**：`<存储后端>ScanIO` 后缀标识适配器。将来要加 Localdrive / Memory 适配器，沿用同款命名。

---

## 7. 测试布局

| 文件 | 覆盖什么 | 类型 |
|------|---------|------|
| `service/scan/list-movie-folders.util.spec.ts` | 电影目录识别规则 | 纯函数单测 |
| `service/scan/scan-movie.util.spec.ts` | NFO 解析 + 元数据组装 | 纯函数单测（fake IO） |
| `repository/movie.repository.spec.ts` | upsert / find / delete + JSON 列行为 | 真实 SQLite（`:memory:`） |
| `repository/movie.repository.spec.ts` | actor 列表替换 + 复合主键 | 真实 SQLite |

**约定**：

- **纯函数必须单测**（不需要 DB）
- **repository 用 `:memory:` SQLite** 跑真实 SQL，**不要 mock DB**
- **service 层**目前没有 spec 文件（业务编排层依赖多，价值不高）—— 这条可选，不强求

---

## 8. 对其他模块的迁移参考

### 8.1 publish 模块当前状态

- `DriveRepository` + `MountRepository` 还在 **JSON 文件存储**（`JsonFileStore`）
- `DriveService` / `MountService` 是单文件 service，没有 scan 子模块
- controller 已经按 movie 的"显式 `Promise<{ data: T }>`"模式加过注解

迁移路径：

1. **Phase 1（不破坏现状）**：把 `DriveRepository` 拆成 `DriveRepository + DriveRecord` + 未来 `DriveSchema`。JSON store 保留为 `JsonFileStore` 实现，drizzle SQLite 实现并存。repository 暴露同一组方法。
2. **Phase 2（按需切换）**：在新场景（比如订阅）使用 SQLite 实现；老场景保留 JSON。两者通过 `DRIVE_STORE_BACKEND=json|sqlite` 环境变量切换。
3. **Phase 3（清理）**：JSON 实现删除，所有调用方迁移到 SQLite。

### 8.2 subscribe 模块当前状态

- 没有独立 repository，订阅记录直接挂在 `DriveRepository.isLocal === false` 的记录上
- `SubscribeService` 是单文件 service

迁移路径：除非订阅需要独立字段（`subscribedAt`、备注历史等），否则**不单独建表**——继续复用 `DriveRepository` + 加列。**避免无意义的表膨胀**。

### 8.3 可照搬的 9 条约定

| # | 约定 | 适用范围 |
|---|------|---------|
| 1 | 五层结构 controller / service / service/scan / repository / domain | 任何业务模块 |
| 2 | `entity = InferSelectModel<typeof schema>`，不手写 | 任何用 drizzle 的模块 |
| 3 | 纯函数 + IO 适配器分离，单测覆盖纯函数 | 任何有"扫描 / 解析"行为的模块 |
| 4 | controller 返回类型显式 `Promise<{ data: ResponseDto }>` | 所有 controller |
| 5 | `index.ts` barrel export，外部只从这里 import | 所有模块 |
| 6 | `@/modules/common/utils/*` 放跨模块共享工具（如 NFO 解析器） | 跨模块复用 |
| 7 | 模块平级挂载，避免循环 import | 任何有相互依赖的模块对 |
| 8 | 持久化策略"懒扫描 + 显式 invalidate"，不写定时器 | 任何"从远端扫描到本地"的模块 |
| 9 | 跨模块通信走 `common/events/drive-events.emitter` 的 `DriveEventsEmitter`；事件 payload 类型集中维护在 `drive-events.types.ts` 的 `DriveEventMap` | 任何跨模块反向通信场景 |

### 8.4 要小心的 7 个 trade-off

| # | Trade-off | 说明 |
|---|-----------|------|
| 1 | **JSON 列 vs 多表** | movie 用 JSON 列存 `genres/directors/...` 是因为"几乎不查询这些字段"。如果要按 `genres = 'Sci-Fi'` 查询，就要拆表。 |
| 2 | **`MovieEntity` 必填 nullable** | `InferSelectModel` 推导出的字段是 `T \| null`，手写 mapper 时要用 `Partial<Entity>` 模式攒字段再断言。 |
| 3 | **Service 注入"对方模块的 service"** | `MoviesService` 直接 `inject(DriveService)`。NestJS 允许，但跨模块依赖要明确写在 `imports` 里，否则运行时找不到 provider。 |
| 4 | **`refresh` 是"先清库再扫"** | 不是 upsert 是 replace。如果有并发请求会丢数据——目前没有，未来要加锁或乐观版本号。 |
| 5 | ~~没有 cache invalidation 事件总线~~ | **已修复**：`DriveEventsEmitter` 走 `drive.deleted` 事件，publish 模块 emit、movie 模块 on。事件定义集中在 `common/events/drive-events.types.ts`。 |
| 6 | **扫描顺序：`listMovieFolders` 用扁平 entries 重建 buckets** | 牺牲一次 O(n) 重建换"无 IO 边界检查"——业务规模小够用，规模上去要改流式。 |
| 7 | **`hyperdriveScanIO` 的 `wait: false`** | 不等远端 block 就绪，订阅 drive 第一次扫描可能拿到空目录。service 层用 `wait=true` 单独控制。

---

## 9. 关联文档

- [08-movie-scanning.md](./08-movie-scanning.md) — 电影目录识别、NFO 解析、海报匹配的**业务规则**
- [03-publish-subscribe.md](./03-publish-subscribe.md) — Drive 元数据模型、descriptor 约定（迁移时的上游依赖）
- [02-drive-identity-model.md](./02-drive-identity-model.md) — Drive Key / namespace / profile 关联
- [07-implementation-checklist.md](./07-implementation-checklist.md) — 全局迁移顺序
