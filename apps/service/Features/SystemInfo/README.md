# SystemInfo Feature

这个目录是 Cinereel 垂直切片结构的最小样板。

## 文件职责

- `SystemInfoModule.cs`：唯一公开的组合入口。
- `GetSystemInfoEndpoint.cs`：HTTP Adapter，负责路由、响应和 OpenAPI 元数据。
- `SystemInfoReader.cs`：读取程序集与运行时信息，不了解 HTTP。

当前规模不需要额外的 `Endpoints`、`Application` 或 `Domain` 子目录。只有新增用例导致文件职责不再清晰时才继续分组。
