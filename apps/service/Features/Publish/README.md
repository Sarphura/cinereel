# Publish Feature

本目录当前只定义 Publish Feature 的代码结构和调用形状，不包含发布业务逻辑。

## 调用链

```text
PublishModule
  -> PublishController
  -> IPublishService
  -> PublishService
  -> 后续确定的持久化与 Hyper Client Adapter
```

## 当前文件

- `PublishModule.cs`：唯一公开的组合入口。
- `PublishController.cs`：由 ASP.NET Core MVC 发现的 HTTP Adapter。
- `IPublishService.cs`：端点依赖的应用逻辑 Interface。
- `PublishService.cs`：应用逻辑模板及内部命令、结果模型。
- `PublishDtos.cs`：HTTP 请求与响应 DTO。

## 当前限制

- 尚未在 `Program.cs` 调用 `AddControllers()`、`MapControllers()` 和 `AddPublishFeature()`，不会改变现有运行行为。
- `PublishService` 的方法会抛出 `NotImplementedException`，仅用于固定下一步需要实现的调用形状。
- 尚未决定持久化方式、Hyper Client Interface、输入校验和错误映射。
- 路由暂定为 `/api/published-drives`，需在接入前与 Web 调用契约一并确认。
