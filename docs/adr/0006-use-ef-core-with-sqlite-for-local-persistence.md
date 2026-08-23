# ADR-0006：使用 EF Core、SQLite 与 Repository 持久化本地状态

- 状态：已接受
- 日期：2026-08-20
- 修订：2026-08-23

## 背景

Cinereel 当前以单实例媒体服务运行，需要持久化 Drive 及其当前 RelationType、Publication、可靠异步操作和永久 IdempotencyKey 墓碑。CreateDrive 要求本地 Drive 以 `RelationType = Ownership` 与创建操作在同一事务中提交，类型变更与扫描任务受理、Publication 状态与任务受理也需要事务一致性。

当前 C# 服务尚未引入持久化依赖。持久化方案既要支持事务、唯一约束、迁移和并发检查，也应保持本地部署简单，并允许测试覆盖真实的关系数据库行为。

## 决策

- 使用 EF Core 10 与 SQLite 持久化 Cinereel 本地关系状态。
- 使用共享的 `CinereelDbContext` 作为技术设施；各 Feature 仍拥有自己的实体映射、领域规则与应用 Implementation。
- Drive Module 按持久化 Entity 分别定义内部 Repository Interface：`IDriveRepository` 与 `IDriveCreationOperationRepository`；每个 Interface 由同名 EF Core Repository Adapter 实现。DriveOwnership 与 Subscription 由 `DriveEntity.RelationType` 表达，不建立独立 Repository Seam。
- 不定义 Generic Repository，也不使用一个聚合全部 Drive 持久化对象的 Feature Repository。Repository Interface 只提供所属 Entity 的 `FindByIdAsync`、`FindAllAsync`、`Add` 与 `Remove` 等集合操作。
- Repository 不提供 `Update`、`Save` 或 `SaveAsync`。已查询 Entity 的修改由 EF Core 自动跟踪，Repository 方法本身不得提交数据库。
- `DriveService` 负责 CreateDrive 的幂等判断、状态迁移、Hyper Client 调用和补偿编排；Repository 负责 EF Core 查询与集合访问，不隐藏或执行用例状态机。
- 使用 `Infrastructure/Persistence` 中共享的内部 `IUnitOfWork` 作为唯一提交入口。它统一提交当前 Scoped `CinereelDbContext` 的更改，并允许失败恢复流程清除不再可信的 EF Core 跟踪状态。
- 一次 `SaveChangesAsync` 在同一个本地事务中提交 Drive、RelationType 与 DriveCreationOperation 的相关状态变化；不得在 Repository Adapter 内独立提交。
- 使用数据库主键、唯一索引和外键落实可以由数据库保证的不变量；同一进程内针对相同 `Idempotency-Key` 的并发创建由 Singleton `DriveCreationLock` 串行化。
- 持久化类型统一使用 `Entity` 后缀，放在所属 Feature 的 `Entity/`；Repository Interface 与 Adapter 放在 `Repository/`；EF Core 映射放在 `Configuration/`，并使用独立的 `IEntityTypeConfiguration<TEntity>`。
- `CinereelDbContext` 通过 `ApplyConfigurationsFromAssembly` 加载各 Feature 的 Entity Configuration，避免把所有映射集中到共享 `OnModelCreating`。
- 子目录只表达物理职责，Drive Module 内的 namespace 保持扁平，统一使用 `Cinereel.Features.Drive`。
- 数据库结构通过 EF Core migration 演进，不依赖运行时自动建表表达长期版本历史。
- 应用启动时在接受请求前执行 `Database.MigrateAsync`，自动把配置的 SQLite 数据库迁移到当前版本。
- 自动化测试使用 SQLite 内存数据库或临时文件数据库，不使用 EF Core InMemory provider。
- `IDriveService` 等公开应用 Interface 不暴露 Repository、`CinereelDbContext` 或其他 EF Core 类型；Repository Interface 与实体均属于 Drive Module 的内部 Implementation。
- 默认连接字符串为 `Data Source=cinereel.db`，部署时可以通过 `ConnectionStrings:Cinereel` 覆盖。

本 ADR 不决定备份策略或数据库加密；这些属于运行与发布设计。

后端日常目录与类型命名遵循 [`apps/service/NAMING.md`](../../apps/service/NAMING.md)。

## Implementation 结构

Drive Module 的持久化相关文件采用以下结构：

```text
Features/Drive/
├── Entity/
│   ├── DriveEntity.cs
│   ├── DriveCreationOperationEntity.cs
│   └── DriveCreationOperationStatus.cs
├── Repository/
│   ├── IDriveRepository.cs
│   ├── DriveRepository.cs
│   ├── IDriveCreationOperationRepository.cs
│   └── DriveCreationOperationRepository.cs
└── Configuration/
    ├── DriveEntityConfiguration.cs
    └── DriveCreationOperationEntityConfiguration.cs

Infrastructure/Persistence/
├── CinereelDbContext.cs
├── CinereelDbContextFactory.cs
├── IUnitOfWork.cs
├── UnitOfWork.cs
├── PersistenceConfiguration.cs
└── Migrations/
```

这一结构保留按 Feature 聚合的 Locality，同时使用 `Entity`、`Repository`、`Configuration` 与 Unit of Work 等 Java/Spring Data 开发者熟悉的职责名称。ASP.NET Core、EF Core、SQLite 与 migration 仍提供底层框架能力；这些类型不是对 ORM、事务或建表机制的自研替代品。

## 备选方案

### 使用 Dapper 与 SQLite

此方案让 SQL、事务和查询计划完全显式，运行时抽象较少。

但实体映射、变更跟踪、migration、并发检查和重复样板都需要手工维护。当前模型包含多组关系与可靠操作记录，EF Core 能以更少的 Interface 成本集中这些技术细节，因此不采用。

### 先使用内存持久化

此方案可以快速搭建 Controller 与应用 Interface，也便于编写简单测试。

但进程重启会丢失 Drive、IdempotencyKey 和恢复任务，无法满足已经接受的领域语义。之后切换数据库还会重新验证事务与唯一约束，因此不采用。

### 使用 PostgreSQL

此方案具有更强的并发能力、运维工具和横向扩展基础。

但 Cinereel 当前是单实例本地服务，引入独立数据库进程会显著增加安装与运行成本。现阶段没有需要 PostgreSQL 的并发或部署需求，因此不采用。

### 使用一个 Feature Repository

此方案由一个 `IDriveRepository` 同时管理 Drive 与 DriveCreationOperation，并可以在 Repository 内协调提交。

但 Repository 方法会混合多个 Entity 的查询和状态操作，随着 Drive 用例增加而持续膨胀。当前选择每种 Entity 一个 Repository，并由共享 `IUnitOfWork` 明确表达跨 Repository 的提交位置，因此不采用。

### 使用 Generic Repository

此方案通过 `IRepository<TEntity, TId>` 复用通用查询、添加、更新和删除逻辑，可以减少具体 Repository 文件。

但唯一键查询、关系加载、状态条件与后续复杂查询很快需要额外扩展，最终会形成 Cinereel 自己维护的持久化框架。EF Core 的 `DbSet<TEntity>` 已提供通用集合能力，因此不采用。

### Repository 使用领域状态迁移方法

此方案让 Repository 提供 `MarkHyperDriveCreatedAsync`、`CompleteCreationAsync`、`MarkCompensatedAsync` 等方法，把创建操作状态持久化细节隐藏起来。

但 CreateDrive 的状态迁移还需要协调 Hyper Client 调用、异常处理与补偿，拆入 Repository 会把同一个用例流程分散到两个位置。当前选择由 `DriveService` 集中编排状态机，Repository 只管理 Entity 集合，因此不采用。

### 每个 Repository 独立提交

此方案让单个 Repository 方法可以自行完成持久化，调用方不需要显式使用 `IUnitOfWork`。

但 Drive 的 RelationType 与 DriveCreationOperation 必须作为一个本地一致性单元提交。各 Repository 独立提交会产生部分成功，并破坏 CreateDrive 的同步完成与补偿语义，因此不采用。

### 引入 ABP 或其他企业应用框架

此方案可以提供 Repository、Unit of Work、审计、权限、Module、后台任务与统一异常处理等约定能力。

但 Cinereel 当前是单实例本地媒体服务，核心复杂度来自 Hyper Client 集成、跨资源补偿、DriveScan 与 Publication 状态机；完整企业框架不能消除这些领域规则，却会接管 Entity、应用层和项目结构。当前继续使用 ASP.NET Core、EF Core 与按需编写的薄装配层，因此不采用。

## 后果

正面影响：

- 单文件 SQLite 保持本地部署简单，同时提供真实关系事务与约束。
- EF Core migration 为后续 Feature 提供统一的结构演进方式。
- 测试与生产使用同一种数据库引擎，能覆盖唯一约束、外键和事务行为。
- Repository Interface 把持久化访问集中在 Drive Module 内部，`DriveService` 可以专注于用例编排和补偿状态机。
- `IUnitOfWork` 让跨 Repository 的一次提交以及失败后的跟踪状态清理具有统一位置。
- 每种 Entity 的查询和集合操作拥有固定位置，Java/Spring Data 开发者可以沿 `Controller -> Service -> Repository -> Entity` 调用链定位代码，同时 Feature 文件仍保持聚合。
- 独立 Entity Configuration 让每个 Feature 拥有自己的表结构映射，共享 `CinereelDbContext` 不会随 Feature 增长形成大型映射方法。
- 公开应用 Interface 不暴露 Repository 或 EF Core 类型，调用方不需要理解持久化 Implementation。
- 启动时自动应用 migration，简化当前单实例部署的数据库升级流程。

代价与约束：

- SQLite 的写入并发有限，长事务和后台任务必须保持短小。
- Repository Interface 当前只有 EF Core Adapter，且多数方法与 `DbSet` 操作接近，会增加内部 Interface、依赖注入和测试装配样板。
- 一个 Drive 用例可能同时依赖多个 Repository 与 `IUnitOfWork`，调用链和构造函数参数会比直接操作 `CinereelDbContext` 更长。
- `IUnitOfWork` 与所有 Repository 必须共享同一个 Scoped `CinereelDbContext`；错误的生命周期配置会破坏原子提交和跟踪状态清理。
- `DriveCreationLock` 只协调单个进程，不能替代数据库唯一约束，也不支持多实例写入协调。
- EF Core 实体与领域结果需要明确映射，不能把可变跟踪实体直接返回给调用方。
- 启动时自动 migration 会增加启动阶段失败模式；迁移失败时应用不能开始接受请求。
- 数据库文件生命周期、备份和损坏恢复需要后续运维设计。
- 如果未来改用 PostgreSQL，仍需验证 SQLite 特有行为与 SQL 差异。
