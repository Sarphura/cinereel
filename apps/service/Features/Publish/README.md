# Publish Feature

本目录定义 Publish Module 的 HTTP Interface、应用 Interface 和 Implementation 模板。领域规则以根目录 `CONTEXT.md` 和 `docs/adr/0001-publish-publication-state-machine.md` 为准。

> 本文描述当前模板状态，后端命名统一遵循 [`apps/service/NAMING.md`](../../NAMING.md)。继续实现 Publish 前，应把 `PublishModule` 迁移为 `PublishConfiguration`，并把聚合的 `PublishDtos.cs` 按顶层类型拆入 `Dto/`；不要复制这些历史名称创建新 Feature。

## 调用链

```text
HTTP 请求
  -> PublishController
  -> IPublishService
  -> PublishService
  -> 后续实现的持久化与 Hyper Client Adapter
```

`IPublishService` 是 Controller 与应用逻辑之间的 Seam。Controller 只负责 HTTP DTO 和状态码映射；Publication 状态机、幂等、并发仲裁、可靠异步受理和重试全部属于 `PublishService` 的 Implementation。

## 端点模板

- `GET /api/drives/{driveId}/publication`：查询 Drive 的唯一 Publication。
- `POST /api/drives/{driveId}/publication/publish`：受理 Publish。
- `POST /api/drives/{driveId}/publication/unpublish`：受理 Unpublish。

新操作被可靠受理时返回 `202 Accepted` 和当前 Publication；幂等重复命令返回 `200 OK` 和未改变的 Publication。不存在返回 `404 ProblemDetails`，状态冲突返回 `409 ProblemDetails`。

## 文件职责

- `PublishController.cs`：由 ASP.NET Core MVC 发现的 HTTP Adapter。
- `IPublishService.cs`：仅定义应用 Interface。
- `PublishService.cs`：应用逻辑的内部 Implementation 模板。
- `PublishDtos.cs`：应用数据模型、命令结果、HTTP 响应 DTO 与映射。
- `PublishModule.cs`：依赖注册入口。

## 当前限制

- 尚未在 `Program.cs` 调用 `AddControllers()`、`MapControllers()` 和 `AddPublishFeature()`，端点当前不会改变运行行为。
- `PublishService` 尚未实现，调用时会抛出 `NotImplementedException`。
- 尚未选择持久化方案、可靠任务机制或 Hyper Client Adapter。
- 本阶段不包含自动重试、Hyper Client 确认处理和 Drive 删除约束的代码。
