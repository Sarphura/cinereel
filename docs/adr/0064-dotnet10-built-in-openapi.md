# On .NET 10, App Server uses `Microsoft.AspNetCore.OpenApi` (built-in); Swashbuckle is not a V1 dependency

The .NET 10 Application Server emits its OpenAPI 3.x document via `Microsoft.AspNetCore.OpenApi` 10.x, the framework's built-in OpenAPI implementation. The document is served at `/openapi/v1.json`. Swashbuckle.AspNetCore is not a V1 dependency.

This decision supersedes ADR 0034's choice of Swashbuckle on .NET 10 hosts. The wire format (OpenAPI 3.x JSON), the route family (`/openapi/...` or `/api/openapi/...`), and the contract with `openapi-typescript` codegen are unchanged.

## Context

ADR 0034 specified Swashbuckle.AspNetCore 6.x as the App Server's OpenAPI surface, with the document served at `/api/swagger/v1.json` and Swagger UI at `/swagger`. That ADR was written before the App Server target was confirmed to be .NET 10. Three facts changed:

- `Microsoft.AspNetCore.OpenApi` is stable on .NET 10. ASP.NET Core's first-class OpenAPI surface is documented at https://learn.microsoft.com/aspnet/core/release-notes/aspnetcore-10.0.
- Swashbuckle.AspNetCore 7.2.0 ships with `Microsoft.OpenApi` 2.0.0 in `netstandard2.0` and `net8.0` flavors only. It does **not** ship a `net10.0` build. Referencing Swashbuckle 7.2.0 from a `net10.0` host triggers the `NU1701` / `NU1510` warnings and (in the minimal skeleton) was uncompilable — the `Microsoft.OpenApi.Models` namespace referenced by Swashbuckle 7.2.0 is not exposed through the `net10.0` TFM.
- The built-in `Microsoft.AspNetCore.OpenApi` 10.x emits the same OpenAPI 3.x JSON via `IServiceCollection.AddOpenApi()` and `IEndpointRouteBuilder.MapOpenApi()`. The codegen consumer (`openapi-typescript`) does not care which library produced the document.

## Decision

Use `Microsoft.AspNetCore.OpenApi` 10.x. Do not reference Swashbuckle.

### Route

- The document is served at `/openapi/v1.json` (the framework default).
- ADR 0034's `/api/swagger/v1.json` is **superseded**. Consumers must update their codegen invocation to read `/openapi/v1.json`. The `app/web/` codegen config must be updated alongside this ADR.

### Codegen contract

- The codegen consumer runs `openapi-typescript http://127.0.0.1:8090/openapi/v1.json -o apps/web/src/api/schema.ts` (ADR 0042).
- The CI check (ADR 0058) verifies the generated `schema.ts` matches what the App Server's `/openapi/v1.json` produces at build time.

### Versioning header

- The `X-Cinereel-Version` header check (ADR 0033) is **unchanged**. The Hyper Agent reads this from `/api/version`, not from the OpenAPI document.

### What we lose

- Swagger UI. There is no built-in Swagger UI in `Microsoft.AspNetCore.OpenApi` 10.x. If we want UI again, we either:
  - Use a community-built UI (e.g. `Scalar.AspNetCore`) and add it back later.
  - Embed a static OpenAPI viewer in the SPA.
- Both are V2 tasks. V1 does not ship a built-in UI; the SPA renders any docs.

### Why not stay on Swashbuckle

- Force-referencing `Microsoft.OpenApi` 2.0.0's `net8.0` build from a `net10.0` host produces `NU1701` warnings at restore time and at minimum an extra hop through netstandard compatibility.
- Upgrading to a Swashbuckle build that targets `net10.0` (when it ships) is a tracking liability. The built-in implementation is the canonical path going forward.

## Trade-off accepted

- Operators who relied on `/swagger` for browsing the API must use the JSON document directly or wait for V2.
- `openapi-typescript` codegen continues to work; only the URL changes.
- The codegen route in the CI workflow (ADR 0058) must be updated when this lands there.