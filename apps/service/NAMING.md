# Cinereel 后端命名规范

本文定义 `apps/service` 的目录、文件和 C# 类型命名。它是日常开发规范；领域词义以仓库根目录 `CONTEXT.md` 为准，架构选择及取舍以 `docs/adr/` 为准。

## 总体原则

- 先按 `Features/<Feature>/` 聚合业务能力，再在 Feature 内按职责分组，不创建全局 `Controllers/`、`Services/`、`Repositories/` 或 `Dtos/`。
- 使用 Java/Spring Data 开发者熟悉的职责名称，但保留 C# 的 Interface `I` 前缀、PascalCase 和文件级 namespace 等原生习惯。
- 名称表达调用方需要理解的职责，不暴露只有一个 Adapter 时无意义的传输或框架细节。
- 技术命名不得改变 `Drive`、`DriveId`、`DriveKey`、`DriveOwnership`、`Subscription`、`Publication` 等规范领域语言。
- 小型 Feature 可以保持扁平；只有已经出现对应职责时才创建子目录，不预建空目录。

## Feature 目录

规模较大的 Feature 使用以下单数 PascalCase 子目录：

```text
Features/<Feature>/
├── Controller/
├── Service/
├── Dto/
├── Entity/
├── Repository/
├── Model/
├── Client/
├── Configuration/
└── Job/
```

各目录职责如下：

| 目录 | 职责 | 示例 |
|---|---|---|
| `Controller/` | ASP.NET Core MVC HTTP Adapter | `DriveController` |
| `Service/` | 应用 Interface、用例编排及其内部协作者 | `IDriveService`、`DriveService`、`DriveCreationLock` |
| `Dto/` | 用例输入、输出和执行结果 | `CreateDriveRequest`、`DriveResponse` |
| `Entity/` | EF Core 持久化 Entity 与其状态类型 | `DriveEntity`、`DriveCreationOperationStatus` |
| `Repository/` | 每种 Entity 的 Repository Interface 与 EF Core Adapter | `IDriveRepository`、`DriveRepository` |
| `Model/` | 值对象、领域标识和分类类型 | `DriveId`、`DriveContentTypeId` |
| `Client/` | 外部进程或第三方依赖的 Client Interface 与 Adapter | `IHyperClient`、`HyperClient` |
| `Configuration/` | Feature 依赖注册和 EF Core Entity Configuration | `DriveConfiguration`、`DriveEntityConfiguration` |
| `Job/` | 后台调度、恢复或补偿任务 | `DriveCreationRecoveryJob` |

目录只用于物理导航，不形成子 namespace。Drive Feature 中上述文件统一使用：

```csharp
namespace Cinereel.Features.Drive;
```

其他 Feature 对应使用 `Cinereel.Features.<Feature>`。共享技术设施使用 `Cinereel.Infrastructure.<Area>`。

## 文件与类型

- 每个可独立复用或查找的顶层类型放在独立文件中，文件名与类型名一致。
- 仅供单个类型使用的私有嵌套类型可以保留在同一文件。
- 不使用 `DriveContracts.cs`、`DriveTypes.cs`、`DriveDtos.cs` 等聚合文件承载多个顶层类型。
- 类型默认使用 `sealed`；只有明确存在继承需求时例外。
- Controller action、公共应用 Interface 及其参数和返回 DTO 使用 `public`；Feature Implementation 默认使用 `internal`。

## Controller

- 类名使用单数资源名加 `Controller`，例如 `DriveController`。
- HTTP 集合路由继续使用复数，例如 `/api/drives`。
- Controller 依赖 `IXxxService`，不直接依赖 `XxxService`、Repository 或 `CinereelDbContext`。

```csharp
public sealed class DriveController(IDriveService driveService) : ControllerBase;
```

不得为了匹配复数路由把类命名为 `DrivesController`。

## Service

应用 Interface 与 Implementation 使用 C# 标准配对：

```text
IDriveService.cs
DriveService.cs
```

- Interface 使用 `I` 前缀，Implementation 使用自然名称。
- 不使用 Java 风格的 `DriveServiceImpl`。
- `XxxService` 只用于业务用例入口或有明确业务职责的协作者，不用于依赖注册、后台任务或远程 Client。

## DTO 与结果

统一使用以下后缀：

| 语义 | 后缀 | 示例 |
|---|---|---|
| 用例输入 | `Request` | `CreateDriveRequest` |
| 用例输出 | `Response` | `DriveResponse` |
| 带业务分支的执行结果 | `Result` | `CreateDriveResult` |
| 执行结果枚举 | `ResultCode` | `CreateDriveResultCode` |

`Response` 表示离开应用 Service 的用例输出，不限定为 ASP.NET Core HTTP Response。Controller 可以直接返回无框架依赖的 Response DTO。

正常业务分支通过 `ResultCode` 表达，例如 `Created`、`Replayed`、`IdempotencyConflict` 与 `Gone`；不要使用异常表达这些预期分支。

不要新增以下命名：

```text
DriveSnapshot
CreateDriveCommand
CreateDriveOutcome
DriveHttpContracts
DriveContracts
```

## Entity 与枚举

- EF Core 持久化模型统一使用 `Entity` 后缀，例如 `DriveEntity`。
- 不使用无后缀领域名冒充当前贫血持久化模型，也不使用 `PO` 后缀。
- 生命周期或处理阶段使用 `Status`，例如 `DriveCreationOperationStatus`。
- 分类使用 `Type`，例如 `DriveRelationType`。
- 用例结果分支使用 `ResultCode`，例如 `CreateDriveResultCode`。
- 不在同类语义中混用 `Kind`、`State` 与 `Outcome`。

EF Core 映射使用独立 Configuration：

```text
Entity/DriveEntity.cs
Configuration/DriveEntityConfiguration.cs
```

Entity 保存持久化数据，Configuration 保存表名、长度、索引、关系和转换规则。不要把所有 Feature 的映射集中到 `CinereelDbContext.OnModelCreating`，也不要混用 Attribute 与 Fluent Configuration 表达同一套约束。

## Repository 与 Unit of Work

- 每种持久化 Entity 定义一个 Repository Interface 和一个 EF Core Adapter，例如 `IDriveRepository` / `DriveRepository`。
- Repository 提供 `FindByIdAsync`、`FindAllAsync`、`Add`、`Remove` 等 Entity 集合操作。
- EF Core 自动跟踪已查询 Entity 的修改，不额外提供 `Update`。
- Repository 不提供 `Save` 或 `SaveAsync`，也不得自行调用 `SaveChangesAsync`。
- 所有 Repository 共享同一个 Scoped `CinereelDbContext`，由共享 `IUnitOfWork` 统一提交。
- 不创建 `IRepository<TEntity, TId>` 或其他 Generic Repository 基础框架。

完整持久化决策见 [`ADR-0006`](../../docs/adr/0006-use-ef-core-with-sqlite-for-local-persistence.md)。

## Client

Client 按外部系统命名，而不是提前按尚未形成的能力拆分：

```text
IHyperClient.cs
HyperClient.cs
```

- `IHyperClient` 表示 Cinereel 自己维护的 Hyper Client 进程这一远程依赖。
- HTTP 路由、JSON、固定存储类型和错误协议封装在 `HyperClient` Adapter 内。
- 当前只有一个生产 Adapter 时，不使用 `HyperDriveHttpClient`、`HyperDriveClient` 或 `HyperHttpAdapter`。
- 只有出现多个真实传输 Adapter 后，才使用 `HyperHttpClient`、`HyperGrpcClient` 等名称区分 Implementation。
- 不因 Interface 未来可能增长而预先拆成 `IHyperDriveClient`、`IHyperFileClient`、`IHyperPublishClient`。

## Configuration

依赖注入入口和 EF Core 映射统一使用 `Configuration` 后缀：

```text
DriveConfiguration
PersistenceConfiguration
DriveEntityConfiguration
```

- Feature 注册入口提供 `Add<Feature>Feature` 扩展方法。
- 不使用 `DriveModule`、`PersistenceModule` 或冗长的 `DriveServiceCollectionExtensions` 作为类型名。
- `Module` 保留为架构术语，不作为依赖注册类后缀。

## Job 与 Exception

- 继承 `BackgroundService` 的恢复、补偿或定时任务使用 `Job` 后缀，例如 `DriveCreationRecoveryJob`。
- 不使用 `Worker` 或 `Service` 后缀表达后台任务。
- Exception 跟随所属职责放置，例如 `Client/HyperClientException.cs` 与 `Service/DriveCreationRecoveryPendingException.cs`。
- 不创建统一 `Exception/` 目录，也不把多个不相关 Exception 合并进 `DriveExceptions.cs`。

## 重命名映射

迁移旧代码时使用以下映射：

| 旧名称 | 规范名称 |
|---|---|
| `DrivesController` | `DriveController` |
| `DriveSnapshot` | `DriveResponse` |
| `CreateDriveCommand` | `CreateDriveRequest` |
| `CreateDriveOutcome` | `CreateDriveResultCode` |
| `DriveRelationKind` | `DriveRelationType` |
| `DriveCreationOperationState` | `DriveCreationOperationStatus` |
| `IHyperDriveClient` | `IHyperClient` |
| `HyperDriveHttpClient` | `HyperClient` |
| `HyperDriveProtocolException` | `HyperClientException` |
| `DriveCreationRecoveryWorker` | `DriveCreationRecoveryJob` |
| `DriveModule` | `DriveConfiguration` |
| `PersistenceModule` | `PersistenceConfiguration` |

现有代码出现旧名称时，不应把旧名称当作新 Feature 的样板；在修改对应 Feature 时按本规范迁移，并同步测试、依赖注册和文档引用。
