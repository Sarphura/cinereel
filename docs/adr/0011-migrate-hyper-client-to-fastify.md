# ADR-0011：将 Hyper Client 从 Express 迁移到 Fastify

- 状态：已提议
- 日期：2026-09-10

## 背景

Hyper Client 当前使用 NestJS 11 + Express adapter（`@nestjs/platform-express`）。HTTP 层通过 `nestjs-zod` 用 zod 做请求校验、响应序列化与 OpenAPI 生成；流式文件传输在 `file-response.writer.ts` 中手工操作 Express 的 `response.write()`、`drain` 背压、`destroy()` 与断连监听，并刻意实现「首块就绪后才提交响应，保留缺块超时的 JSON 错误响应能力」。日志实际使用 `console.log`/`console.warn`，`pino` 相关依赖已声明但未使用。

迁移目标：改用 Fastify（`@nestjs/platform-fastify`），采用官方推荐的 Schema 校验 + 快速序列化，移除 HTTP 层 zod，引入内置 pino 日志，并用更现代的流式/异步模型替代手工流控。

## 决策

### 迁移到 Fastify，采用官方推荐写法

HTTP adapter 从 `@nestjs/platform-express` 切换为 `@nestjs/platform-fastify`，使用 `FastifyAdapter`。除流式文件传输外，其余 controller 仅使用框架无关的 NestJS 装饰器，迁移成本低。CORS 改用 `@fastify/cors`，Swagger UI 依赖 `@fastify/static`，并显式开启 `exposeHeadRoutes: true` 以替代「Express 用 GET 匹配 HEAD」的行为。

### 决策 A：zod 分层处理

zod 在两个层次被使用，采取分层策略：

- **HTTP 层移除 zod**：`createZodDto`、`ZodValidationPipe`、`ZodSerializerInterceptor`、`ZodResponse`、`cleanupOpenApiDoc` 全部移除，改用 `@ApiProperty` 装饰器 + class-validator + class-transformer。
- **持久化层保留 zod**：`download-task.types.ts` 的 `DownloadRequestSchema`（含 `driveKey` 小写化 transform 与跨字段 refine）、`StoredDownloadTaskSchema`（含 10+ 条 `superRefine` 跨字段约束）以及 `download-task.store.ts` 的 `StoreSchema` 继续保留。它们是进程内磁盘数据校验与领域类型推断工具，与 HTTP 框架无关；JSON Schema 无法表达 transform，也极难维护这些跨字段约束，且会失去 `z.infer` 类型推断。`download-task.service.ts` 的 `safeParse` 与 `StoreSchema.parse` 不动。

HTTP 层改为 class DTO 后，`CreateDownloadTaskDto`（class）与 `DownloadRequestSchema`（zod）出现字段重复定义，这是把 HTTP 契约与领域模型解耦的合理代价；跨字段 refine 仍由领域层 `safeParse` 兜底，HTTP 层只做结构校验。

### 决策 B：流式传输保留「首块失败返回 JSON 错误」

保留当前「首块就绪前失败返回结构化 JSON、首块就绪后失败才断连」的语义，因为媒体服务在 P2P 网络下正文缺块是高频场景，503/504 需作为可编程 JSON 错误返回给 C# 服务与 Web 前端，否则客户端只能看到「200 后突然断流」。

实现上仍采用官方推荐的 `reply.send(stream)`，只是多一步：先 `await` 正文流首块，失败即抛 `HttpException` 返回 JSON；成功后把「首块 + 剩余流」重组为 Readable 交给 Fastify 自动背压与销毁。断连清理交给 Fastify 销毁 stream 后触发 `file-read.ts` 已有的 session 关闭逻辑，不再手工监听 `aborted`/`close` 与 `destroy()`。

### 决策 C：校验与序列化形式

- 请求校验：class-validator + class-transformer + NestJS `ValidationPipe`（`transform: true`、`whitelist: true`、`forbidNonWhitelisted: true`）。
- 响应序列化：DTO 用 `@ApiProperty` 定义字段，配合 `@ApiOkResponse`/`@ApiCreatedResponse` 生成 JSON Schema，由 Fastify 自动用 `fast-json-stringify` 快速序列化。
- Swagger：同一套 `@ApiProperty` 装饰器生成 OpenAPI，替代 `cleanupOpenApiDoc`，保证 `operationId`、字段名、nullable 与迁移前一致。

zod 能力到新写法的映射：`z.coerce.number()` → `@Type(() => Number)` + `@IsInt`；`.default()`/`.optional()` → `@IsOptional` + `@Transform`；`.enum()` → `@IsIn`；`.regex()` → `@Matches`；`.refine()` → `@Validate`；`.transform()` → `@Transform`；空字符串转 undefined → `@Transform`。

## 依赖变更

- 移除：`express`、`@types/express`、`@nestjs/platform-express`、`cors`、`nestjs-zod`、`nestjs-pino`、`pino`、`pino-http`、`pino-pretty`。
- 新增：`@nestjs/platform-fastify`、`@fastify/static`、`fastify`、`mime-types`、`content-disposition`。
- 保留：`class-validator`、`class-transformer`、`zod`（领域层使用）。

## 执行计划

1. 阶段 0：更新 `package.json` 依赖并重新安装。
2. 阶段 1：改写 `main.ts`，切换 `FastifyAdapter`、CORS、body parser、Swagger，开启 `exposeHeadRoutes`。
3. 阶段 2：DTO 层改写为 class + `@ApiProperty`（`drives.dto.ts`、`files.dto.ts`、`health.dto.ts`、`downloads.dto.ts`）；删除死代码 `swarm.dto.ts` 与 `files.dto.ts` 中未使用的 schema。
4. 阶段 3：`app.module.ts` 改用 `ValidationPipe`；controller 层 `@ZodResponse` 改为 `@ApiOkResponse`/`@ApiCreatedResponse`。
5. 阶段 4：删除 `ExpressFileResponseWriter`，新增 `FastifyFileResponseWriter`（先取首块 + `reply.send(stream)`），并切换 `file.module.ts` 的 DI 提供者。
6. 阶段 5：改写 `protocol-file.controller.ts`（`request.iterator`/`request.is`/`request.get` → `request.raw` 迭代与 `request.headers`）。
7. 阶段 6：持久化层保持不动，确认 `download-task.*` 无变化。
8. 阶段 7：移除 `console.log`/`console.warn`，改用 `@nestjs/common` 的 `Logger`；HTTP 访问日志由 Fastify 内置 pino 输出。
9. 阶段 8：迁移全部测试到 `FastifyAdapter`，移除测试中的 `ZodValidationPipe`/`ZodSerializerInterceptor`/`cleanupOpenApiDoc` 引用。

## 备选方案与取舍

- 彻底移除 zod（含持久化层）：可满足「零 zod」目标，但需手写三个 interface（约 30 字段）、`parseDownloadRequest`（含 toLowerCase）、`validateStoredTask`（逐条翻译 10+ 条跨字段约束）与 `validateStore` 并配套单测，工作量最大且易引入类型与校验的漂移，因此不采用。
- 流式传输完全交给 `reply.send(stream)` 一步到位：代码最简洁，但会丢失「首块失败返回 JSON 错误」语义，503/504 变成「200 后断流」，破坏对外契约并需改动 C# 与 Web 的错误处理，因此不采用。
- 纯 Fastify ajv 校验（绕过 class-validator）：需手写路由级 schema，偏离 NestJS 官方推荐，因此不采用。

## 后果

正面影响：

- 统一采用 Fastify 官方推荐的 Schema 校验与快速序列化，响应序列化性能更高。
- 流式传输改为声明式 `reply.send(stream)`，背压与断连清理交给框架，减少手工流控代码。
- 移除 `nestjs-zod` 及 Express 相关依赖，消除 `express@4` 与 `platform-express` 内部 `express@5` 的版本混用。
- HTTP 访问日志接入内置 pino，替换 `console` 输出。

代价与约束：

- `file-response.writer.ts` 的流式重写是核心风险，需以 `file-content.controller.spec.ts` 的背压/断连/416/503 用例作为回归基线。
- `.coerce`/`.default`/空字符串转 undefined 等 zod 语义迁移需逐条核对，以 `file.controller.spec.ts` 的空查询参数用例回归。
- Swagger 输出需与迁移前比对（`operationId`、字段名、nullable），保证 C# NSwag 客户端契约不变。
- HTTP 层 class DTO 与领域层 zod schema 出现字段重复定义，需注意二者同步。

## 实现说明

迁移落地过程中对计划有几处技术细节修正：

- `@nestjs/platform-fastify` 最终采用 `11.2.3`（`11.1.28` 与 Fastify 5 存在路由 `preParsing` 未初始化的兼容性问题），`@fastify/static` 相应升级到 `^10.1.2`。
- `@fastify/cors` 无需显式声明：`platform-fastify` 已内置，`app.enableCors()` 直接可用。
- 未开启 `exposeHeadRoutes`：`@Head` 路由已显式声明，Fastify 默认不把 HEAD 自动匹配到 GET。
- class-validator 的 `@Validate` 需要 `@ValidatorConstraint` 装饰的类，普通函数不生效，改用 `@ValidateBy` 包装校验函数。
- `ValidationPipe` 采用 `whitelist + forbidNonWhitelisted`，以保持 `DownloadRequestSchema` 的 `.strict()` 拒绝未知字段语义。
- `application/octet-stream` 注册了 stream 解析器（不读入内存、不受 `bodyLimit` 限制），避免 Fastify 对无 parser 的 content-type 返回 415。
- `@ApiCreatedResponse`/`@ApiAcceptedResponse` 只声明 OpenAPI，不设置状态码，需配合 `@HttpCode`。
- 测试需在 `app.init()` 后显式调用 `getInstance().ready()`，否则 Fastify 路由 hook 未初始化。
- 响应序列化不再校验（Fastify `fast-json-stringify` 宽松处理），原「拒绝不符合响应 DTO」测试删除。
- 新增 `content-disposition` 与 `mime-types`，替代 Express `res.attachment()` 的 MIME 推断与文件名编码。
- 附带修复 `download-task.store.ts` 在 Windows 上的目录 `fsync` 与 `rename` 的 `EPERM` 兼容性问题（与迁移无关）。
