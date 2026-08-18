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
