# 13 — OpenAPI: Microsoft.AspNetCore.OpenApi 10.x at /api/openapi/v1.json + dev-only Swagger UI

**What to build:** The OpenAPI surface from ADR 0064 (supersedes 0034). `Microsoft.AspNetCore.OpenApi` 10.x emits an OpenAPI 3.x document. The framework default route is `/openapi/v1.json`; we re-register it as `/api/openapi/v1.json` to keep the route family consistent with `/api/*`. A dev-only Swagger UI is mounted at `/api/openapi/ui` (development environment only) for operator browsing. The codegen consumer (ticket 14) reads from `/api/openapi/v1.json`. Today the document is emitted at `/openapi/v1.json` (the framework default), which conflicts with the web codegen's expected `/api/swagger/v1.json` (ADR 0042).

**Blocked by:** 10 (ProblemDetails types must be visible on the schema)

**Status:** ready-for-agent

- [ ] `Infrastructure/OpenApi/OpenApiSetup.cs` extension method `AddCinereelOpenApi()` registers `AddOpenApi()` and `MapOpenApi()`
- [ ] Route re-registration so `/api/openapi/v1.json` returns the same document as `/openapi/v1.json`
- [ ] Dev-only UI at `/api/openapi/ui` (gated on `app.Environment.IsDevelopment()`)
- [ ] The `Cinereel.Api` Info object names the API `"Cinereel API"`, version `"1.0"`, and includes a description referencing the spec
- [ ] The OpenAPI document includes the `ProblemDetails` schema referenced by every error response (via a custom `IOpenApiSchemaTransformer` or shared schema)
- [ ] Unit test in `Infrastructure.UnitTests/OpenApi/OpenApiDocumentTests.cs` boots the app via `WebApplicationFactory<Program>`, fetches `/api/openapi/v1.json`, asserts OpenAPI 3.x, asserts at least one path is present
- [ ] Existing `Program.cs` `MapOpenApi()` call is replaced with the re-registered path; behaviour change documented in ADR 0064 (already superseded)
