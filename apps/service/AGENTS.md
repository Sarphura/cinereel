# AGENTS.md — Cinereel 后端

本目录是基于 .NET 10 的 ASP.NET Core Web 项目。

## 项目标识

- 项目名称、程序集名称与根命名空间统一为 `Cinereel`。
- 不得使用任何历史项目名称或程序集名称。

## 结构

- `Program.cs`：组合根，只负责宿主生命周期和 Feature 装配。
- `Features/<Feature>/`：按垂直切片组织业务能力。
- `Infrastructure/`：仅放确实被多个 Feature 共享的技术设施。
- `tests/Cinereel.Tests/`：后端自动化测试。

不要预先创建顶层 `Controllers`、`Services`、`Repositories` 或 `Dtos` 目录。Controller、Interface、Implementation 和 DTO 均放在所属 Feature 内。Feature 规模较小时保持扁平；只有出现多个用例或独立领域逻辑后，才在 Feature 内继续分组。

## 命名

- 后端命名必须遵循 [`NAMING.md`](NAMING.md)。新增类型、移动文件或重构现有 Feature 时，应同时检查文件名、类型名、目录和 namespace。
- 保留垂直切片：先按 `Features/<Feature>/` 聚合，再在规模足够时使用 `Controller/`、`Service/`、`Dto/`、`Entity/`、`Repository/`、`Model/`、`Client/`、`Configuration/` 与 `Job/` 等单数 PascalCase 子目录。
- 子目录只表达物理职责，不进入 namespace；同一 Feature 默认统一使用 `Cinereel.Features.<Feature>`。
- 每个可独立复用或查找的顶层类型默认使用独立文件，文件名与类型名一致；Drive Feature 的 DTO 与应用结果码按 Drive 管理、文件操作和 Publication 分组，状态与分类枚举按所属 Entity 或 Model 共置，`DriveContentTypeId` 与 `DriveEntity` 共置，Hyper 调用的数据、结果码与协议异常按 Client 契约共置，具体例外见 `NAMING.md`。不使用缺少职责前缀的 `Contracts.cs`、`Types.cs` 或 `Dtos.cs`。
- 业务 Interface 与 Implementation 使用 C# 标准形式 `IXxxService` / `XxxService`，不得使用 `XxxServiceImpl`。
- 输入、输出和带分支的执行结果分别使用 `XxxRequest`、`XxxResponse`、`XxxResult`；结果枚举使用 `XxxResultCode`。
- EF Core 持久化类型使用 `XxxEntity`；生命周期枚举使用 `XxxStatus`，分类枚举使用 `XxxType`。
- 外部进程 Client 按远程系统命名，例如 `IHyperClient` / `HyperClient`；只有出现多个真实传输 Adapter 时，才在具体 Adapter 名称中加入 `Http`、`Grpc` 等传输标识。
- 依赖注册和 EF Core 映射使用 `XxxConfiguration`；后台恢复或调度任务使用 `XxxJob`。
- Exception 跟随职责放置，不建立统一的 `Exception/` 杂项目录。

## Agent 执行要求

- 任何 Agent 在 `apps/service` 中生成或移动代码前，必须完整阅读本文件和 [`NAMING.md`](NAMING.md)，不得只根据现有相邻文件猜测规范。
- Drive Feature 当前目录树是已经接受的基准结构，不得重新压平，也不得恢复 `DriveContracts.cs`、`DriveTypes.cs`、`DrivesController`、`IHyperDriveClient` 等旧结构或旧名称。
- Drive Feature 的状态与分类枚举和所属 Entity 或 Model 同文件；DTO 与应用结果码集中到 `Dto/DriveDtos.cs`、`Dto/DriveFileDtos.cs`、`Dto/PublicationDtos.cs`，Hyper 目录响应、结果码与协议异常集中到 `Client/HyperClientContracts.cs`，`IHyperClient` 与 `HyperClient` 各自保留独立文件。共置类型保持顶层声明、原有名称、可见性和契约，不嵌套到包装类中，也不跨职责集中到一个文件。
- `DriveContentTypeId` 与 `DriveEntity` 同文件，保留独立的公开顶层值对象及其校验逻辑；共置不改变 Entity 的字符串持久化字段，也不把输入校验移入 Entity。
- Drive Feature 的其余 Model 按职责集中到 `Model/DriveValues.cs`（Drive 标识与字段校验）、`Model/DriveFileModels.cs`（文件路径、目录路径与游标）和 `Model/Publication.cs`（Publication、失败信息及相关枚举），各类型及其校验逻辑保持独立。
- 新 Feature 仍按垂直切片创建；只有出现真实职责时才建立对应子目录，但一旦建立就必须使用 `Controller/`、`Service/`、`Dto/`、`Entity/`、`Repository/`、`Model/`、`Client/`、`Configuration/`、`Job/` 中的规范名称。
- 修改公共 Interface、Module 边界、Repository/UnitOfWork 规则或目录职责前，必须先说明方案及取舍并取得确认；确认后同步更新 `NAMING.md`，需要记录长期架构取舍时同时更新 ADR。
- 完成后端代码修改前，必须检查新增文件的位置、文件名与顶层类型名、namespace、依赖方向和旧名称残留，并运行本文件末尾的构建与测试命令。

## 编码约定

- 使用 ASP.NET Core MVC Controller，不混用 Minimal API 业务端点。
- Controller 使用 `[ApiController]` 和 attribute routing，并保持 `public sealed`。
- Controller 依赖业务 Interface，不直接依赖 Implementation。
- Controller action 签名涉及的 Interface 和 DTO 使用 `public`；Implementation 默认使用 `internal sealed`。
- 每个 Feature 提供一个依赖注册入口，路由由 MVC 自动发现。
- 文件级命名空间统一以 `Cinereel` 开头。
- 类默认标记为 `sealed`，除非明确需要继承。
- 公开端点必须提供 OpenAPI 元数据。
- 错误响应统一使用 `ProblemDetails`。
- 路由使用 kebab-case。
- 文档与代码注释使用中文，标识符使用英文。

## 验证命令

- 构建：`dotnet build apps/service/Cinereel.csproj`
- 运行：`dotnet run --project apps/service/Cinereel.csproj`
- 测试：`dotnet test apps/service/tests/Cinereel.Tests/Cinereel.Tests.csproj`
