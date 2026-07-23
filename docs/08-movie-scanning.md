# 电影扫描规则

> 本文档描述 `type === 'movie'` 的资源 Drive 是如何被自动扫描成
> `MovieRecord` 的：电影目录的识别、海报与 NFO 的匹配、字段填充与降级策略。

## 模块结构

```
movie/                                        ← 电影资源域（可独立复用）
├── domain/
│   ├── movie-nfo.parser.ts                  ← XML 解析（NFO → MovieNfoMetadata）
│   └── dto/movie.dto.ts                    ← MovieRecordDto（对外 DTO）
├── service/
│   ├── scan/                              ← 纯领域逻辑（无 Hyperdrive 依赖）
│   │   ├── constants.ts                   ← 纯配置（海报/NFO 候选名、视频扩展名）
│   │   ├── validators.ts                 ← 业务校验（assertMovieResourcePath）
│   │   ├── list-movie-folders.util.ts     ← 识别：哪些 drive 根直接子目录是电影
│   │   ├── scan-movie.util.ts            ← resolvePosterPath / resolveNfoPath /
│   │   │                                    scanMovieFolderPure / MovieFolderScanIO
│   │   └── io.ts                         ← Hyperdrive → MovieFolderScanIO
│   └── movies.service.ts                   ← 聚合层：并发扫描所有 movie drive
├── movie-scan.module.ts                     ← 可独立复用的子模块（导出 MoviesService）
└── movie.module.ts                         ← 顶层暴露层（导出 MoviesController）

publish/service/
├── movie-nfo.util.ts                     ← 已迁移至 movie/domain/movie-nfo.parser.ts
├── movies.service.ts                      ← 已迁移至 movie/service/movies.service.ts
└── movies.controller.ts                   ← 已迁移至 movie/controller/movies.controller.ts
```

各层职责：

| 模块 | 职责 | 是否涉及 Hyperdrive |
|------|------|---------------------|
| `movie-nfo.parser.ts` | NFO XML 解析，无状态 | 否 |
| `constants.ts` | 纯配置，无状态 | 否 |
| `validators.ts` | 业务校验，无状态 | 否 |
| `list-movie-folders.util.ts` | 从扁平条目列表识别电影目录 | 否 |
| `scan-movie.util.ts` | 从条目列表提取元数据路径；含 `MovieFolderScanIO` 接口 | 否（接口） |
| `io.ts` | `hyperdriveScanIO` 将 Hyperdrive 适配为接口 | 是 |
| `movies.service.ts` | 聚合层，编排整个扫描流程 | 是 |

积木式设计要点：

- **MovieScanModule**（`movie-scan.module.ts`）是独立可复用的子模块，仅依赖
  `DriveBaseModule` 与 `MovieNfoParser`。其他业务（如未来的 Series 模块）可
  直接导入 `MoviesService`，无需感知电影扫描的内部实现。
- **`MovieFolderScanIO` 接口**是 I/O 依赖的注入点：生产环境注入
  `hyperdriveScanIO`，测试时可注入 mock，无需修改任何业务逻辑。

## 目录约定

**电影文件夹 = 资源 Drive 根目录的直接子目录**，即 `entry.key` 的
**第一段路径段**（`segments[0]`）。电影文件夹下可以再放 subs / extras
等子目录，但这些**不参与电影识别**——它们只属于该电影自己的内部组织。

例如：

```
/疯狂动物城 2（2026）/
  poster.jpg
  movie.nfo
  疯狂动物城 2（2026）.mkv
  Subs/
    track.srt
  Extras/
    behindthescenes.mkv

/Inception (2010)/
  folder.jpg
  Inception (2010).torrent

/README.txt       ← 直接放在 drive 根的零散文件
```

扫描得到两部电影：

| `resourcePath` | `posterPath` | `nfoPath` |
|----------------|--------------|-----------|
| `/疯狂动物城 2（2026）` | `/疯狂动物城 2（2026）/poster.jpg` | `/疯狂动物城 2（2026）/movie.nfo` |
| `/Inception (2010)` | `/Inception (2010)/folder.jpg` | — |

Subs / Extras 是 `/疯狂动物城 2（2026）` 内部组织，**不会被识别为独立电影**。
直接挂在 drive 根的 `/README.txt` 等零散文件也不会被识别。

## 电影目录的判定

一个 drive 根直接子目录要被识别为电影目录，**必须**至少满足以下条件之一：

1. 直接子项中含**种子文件**——`.torrent`（参考 ADR 0003：资源 Drive 不含视频字节，只含元数据与种子）
2. 直接子项中含**遗留视频文件**（兼容旧发布者误上传的情况）——`.mkv` / `.mp4` / `.avi` / `.mov` / `.wmv` / `.flv` / `.webm` / `.m4v` / `.iso`

判定**只看 drive 根直接子目录**的子项，电影目录再深的层级一律忽略。
这是为了避免 `subs/track.srt` 这类素材被错误地归类成新电影。

> 详见 ADR 0003：Reference-metadata-only resource drives；视频字节通过 BitTorrent 拉取。
> 推荐的做法是仅依赖 `.torrent`；视频文件判定是为兼容旧 drive 而保留的兜底。

## 元数据匹配

识别到电影目录后，扫描器会从该电影目录的**直接子项**中按约定匹配海报与 NFO：

### 海报文件名优先级

`POSTER_FILE_CANDIDATES`（`movie/service/scan/constants.ts`）按以下顺序匹配：

1. `poster.jpg` / `poster.jpeg` / `poster.png` / `poster.webp`
2. `folder.jpg` / `folder.jpeg` / `folder.png`
3. `cover.jpg` / `cover.jpeg` / `cover.png`
4. `movie.jpg` / `movie.jpeg` / `movie.png`

匹配大小写不敏感（先取 `basename` 再 `toLowerCase`）。命中第一个即返回，
其余候选不再尝试。

### NFO 文件名优先级

`buildNfoCandidates(folderName)`（`movie/service/scan/constants.ts`）按以下顺序匹配：

1. `movie.nfo`（Kodi 推荐的固定命名）
2. `<foldername>.nfo`（某些下载站点的命名，例如 `Dune Part Two (2024).nfo`）

其中 `<foldername>` 在写入候选时会被 `replace(/[/\\:*?"<>|]/g, ' ')` 清
洗并 `toLowerCase`，确保与不同文件系统下的实际文件名匹配。

> 说明：`<foldername>.nfo` 候选使用的"电影目录 basename"取的是
> `scanMovieFolder` 收到的 `folderPath`（即 drive 根的直接子目录
> 名，例如 `疯狂动物城 2（2026）`）。NFO 的搜索范围是该电影目录的**直接子项**
> ——也就是说 `<foldername>.nfo` 期望放在电影文件夹根下，不会跨层级匹配。

### Trailer 文件名优先级

参考 ADR 0015。trailer 在电影目录下识别顺序：

1. `trailer.<ext>`（`<ext>` ∈ `{mp4, webm, mkv, mov}`）
2. `trailer-trailer.<ext>`（某些工具的命名残留）
3. `<foldername>-trailer.<ext>`（下载站点的命名习惯）

匹配大小写不敏感。仅扫描电影目录的**直接子项**，不递归进 `Extras/` 等子目录。

> 说明：trailer 通过 Sidecar HTTP Range 流式提供（ADR 0005、0006），并以原始文件名
> 写入 Jellyfin staging 目录的 `<Title> (<Year>) {imdb-<id>}/trailer.<ext>`。
> Jellyfin 自身的 scanner 会自动将其识别为该电影的 trailer。

### 视频文件 / 种子文件不参与元数据匹配

`resolvePosterPath` / `resolveNfoPath`（`movie/service/scan/scan-movie.util.ts`）只会从
电影目录的**直接子项**中挑海报与 NFO，**不会**进入 `subs/`、`extras/`、
`BDMV/` 等更深层级。视频文件本身用于识别"这是不是一个电影目录"
（见上文判定规则），并不被当作"海报/NFO"来匹配。

## 字段填充与降级策略

`scanMovieFolder` 返回 `MovieRecordDto`：

| 字段 | 何时填充 | 取值 |
|------|----------|------|
| `driveKey` | 始终 | 调用方传入的资源 Drive key |
| `resourcePath` | 始终 | 电影文件夹路径 |
| `indexedAt` | 始终 | `Date.now()` |
| `posterPath` | 匹配到海报时 | 海报文件相对 drive 根的路径 |
| `nfoPath` | 匹配到 NFO 时 | NFO 文件相对 drive 根的路径 |
| `title` / `originalTitle` / `year` / `premiered` / `rating` / `plot` | NFO 存在且解析成功时 | 由 `parseMovieNfo` 解析得到 |

降级策略：

- **NFO 解析失败**（读取异常 / 内容损坏）：`scanMovieFolder` 捕获异常
  并继续返回最小记录（仅含 `driveKey` / `resourcePath` / `indexedAt`）。
  单个坏文件不会拖垮整个列表。
- **没有任何元数据**：仅返回 `resourcePath` 占位记录，前端可显示 fallback 标题。
- **单 drive 扫描失败**：`MoviesService.scanDrive` 用 try/catch 包住，
  失败时记 warn 并跳过该 drive，不影响其他 drive 的列表。

## 调用链

```
GET /api/movies
  └─ MoviesService.listMovies
       ├─ DriveRepository.findAll().filter(type === 'movie')
       └─ for each drive:
            ├─ DriveService.resolveDrive(driveId)
            ├─ DriveQueryService.list('/', wait, drive)    ← wait=true 订阅 / false 本地
            ├─ listMovieFolders(entries)                  ← movie/service/scan/list-movie-folders.util.ts
            └─ Promise.all(folders.map(scanMovieFolder))
                 └─ movie/service/scan/scan-movie.util.ts
                      ├─ resolvePosterPath / resolveNfoPath  ← 纯函数
                      └─ MovieFolderScanIO.readNfo() + parseMovieNfo
```

## 不做的事

为了保持规则的简单与可预测，扫描器**不会**：

- 递归到电影目录的更深层级（subs / extras / BDMV）去找海报或 NFO
- 把 drive 根直接挂载的零散文件（`/README.txt`）识别为电影
- 把不含视频/种子的纯元数据目录识别为电影——必须至少有一个视频/种子
- 把电影目录下含视频文件的内部子目录识别为新电影

如果以后需要支持更深层海报（例如 `Extras/poster.jpg`），应该由用户手动
指定 `posterPath`，而不是改扫描逻辑——这与"只有根目录下的才是电影文件夹"
的简单规则保持一致。
