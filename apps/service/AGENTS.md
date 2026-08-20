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
- 每个可独立复用或查找的顶层类型使用独立文件，文件名与类型名一致；不要新增聚合式 `Contracts.cs`、`Types.cs` 或 `Dtos.cs`。
- 业务 Interface 与 Implementation 使用 C# 标准形式 `IXxxService` / `XxxService`，不得使用 `XxxServiceImpl`。
- 输入、输出和带分支的执行结果分别使用 `XxxRequest`、`XxxResponse`、`XxxResult`；结果枚举使用 `XxxResultCode`。
- EF Core 持久化类型使用 `XxxEntity`；生命周期枚举使用 `XxxStatus`，分类枚举使用 `XxxType`。
- 外部进程 Client 按远程系统命名，例如 `IHyperClient` / `HyperClient`；只有出现多个真实传输 Adapter 时，才在具体 Adapter 名称中加入 `Http`、`Grpc` 等传输标识。
- 依赖注册和 EF Core 映射使用 `XxxConfiguration`；后台恢复或调度任务使用 `XxxJob`。
- Exception 跟随职责放置，不建立统一的 `Exception/` 杂项目录。

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
