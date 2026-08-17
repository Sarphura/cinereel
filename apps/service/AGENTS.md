# AGENTS.md — CineReel.Service（apps/service）

标准 ASP.NET Core Web API 服务，由 `dotnet new webapi` 生成（.NET 10）。本文件记录该 C# 项目的约定，覆盖本目录及其子目录。

## 技术栈与目标框架

- .NET 10（`net10.0`）
- ASP.NET Core 最小 API（Minimal API）
- 内置 OpenAPI（`Microsoft.AspNetCore.OpenApi`）
- 测试：xUnit + `Microsoft.AspNetCore.Mvc.Testing`

## 项目属性

`CineReel.Service.csproj` 应保持以下属性：

- `<TargetFramework>net10.0</TargetFramework>`
- `<Nullable>enable</Nullable>`
- `<ImplicitUsings>enable</ImplicitUsings>`
- `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`
- `<RootNamespace>CineReel.Service</RootNamespace>`

## 代码风格

- 使用文件级命名空间：`namespace CineReel.Service.Xxx;`
- 类默认标记 `sealed`，除非明确设计为可继承。
- 合理使用主构造函数（primary constructor）与记录类型（record）。
- 标识符使用英文：类型/成员 `PascalCase`，局部变量/参数 `camelCase`。
- 注释使用中文。

## 分层与目录

对齐仓库历史服务 `service/` 的分层，按“垂直切片”组织：

- `Features/<Feature>/` — 业务特性，每个 Feature 自包含端点、处理器与模型
- `Infrastructure/` — 横切关注点（认证、日志、OpenAPI、ProblemDetails、设置等）
- `Domain/` — 领域模型
- `Data/` — EF Core `DbContext` 与仓储
- `Events/` — 领域事件
- `tests/` — 测试项目 `CineReel.Service.Tests`

命名空间统一为 `CineReel.Service.<层>.<Feature>`。

## API 约定

- 使用最小 API（`MapGet` / `MapPost` 等），端点按 Feature 分组。
- 错误统一返回 `ProblemDetails`（`Results.Problem(...)`）。
- 公开端点需在 OpenAPI 文档中可见。
- 路由使用 kebab-case。

## 配置

- 配置从 `appsettings.json` / `appsettings.Development.json` 读取。
- 敏感信息使用 User Secrets（开发）或环境变量（生产），不得提交到仓库。
- 连接字符串、密钥等不得写入 `appsettings.json`。

## 依赖管理

- NuGet 包通过 `dotnet add package` 引入。
- 建议启用中央包管理（`Directory.Packages.props`）统一版本。
- 新增依赖需以中文注释说明用途。

## 测试

- 测试项目命名为 `<项目名>.Tests`，即 `CineReel.Service.Tests`。
- 使用 xUnit；集成测试使用 `WebApplicationFactory`（`Microsoft.AspNetCore.Mvc.Testing`）。

## 命令

- 构建：`dotnet build apps/service/CineReel.Service.csproj`
- 运行：`dotnet run --project apps/service`
- 测试：`dotnet test apps/service/tests/CineReel.Service.Tests`
