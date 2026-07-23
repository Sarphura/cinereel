# App Server emits OpenAPI; web UI generates TypeScript types at build time via openapi-typescript

The .NET Application Server exposes an OpenAPI document at `/api/swagger.json` (via `Microsoft.Extensions.ApiDescription.Server` or `Swashbuckle.AspNetCore`). The web UI build pipeline runs `openapi-typescript` against this document, producing TypeScript types into `apps/web/src/api/generated.d.ts`. A small hand-written `apiFetch<T>(path, init)` wrapper is the runtime call site.

## Context

Cinereel web UI is a React 19 SPA. It needs to consume the App Server's `/api/*` endpoints. Three plausible shapes:

- **Runtime fetch + handwritten types** — no codegen. Drift between server and client types surfaces only at runtime.
- **Build-time codegen** — types generated from server's OpenAPI doc at build time. Drift surfaces at compile time.
- **GraphQL** — single schema source of truth, but requires a full GraphQL stack on the server.

## Decision

Build-time codegen via `openapi-typescript`.

### Server-side

The App Server registers the OpenAPI generator:

```csharp
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Cinereel API", Version = "1.0" });
});
// ... later in pipeline ...
app.UseSwagger(c => c.RouteTemplate = "api/swagger/{documentName}.json");
app.MapGet("/api/swagger/v1.json", (ISwaggerProvider sp) => sp.GetSwagger("v1"));
```

`Microsoft.Extensions.ApiDescription.Server` is added in development for codegen support.

### Web UI build pipeline

```json
{
  "scripts": {
    "codegen:api": "openapi-typescript http://localhost:8090/api/swagger/v1.json -o src/api/generated.d.ts",
    "prebuild": "pnpm run codegen:api",
    "predev": "pnpm run codegen:api"
  }
}
```

In CI, a fake App Server (a precomputed swagger.json fixture) is used so the build doesn't depend on a running server.

### Fetcher

```typescript
// apps/web/src/api/fetcher.ts
import type { components } from './generated';

type ApiPaths = keyof components;
type ApiResponse<P extends ApiPaths, M extends keyof components[P]> = ...;

export async function apiFetch<P extends string>(
  path: P,
  init?: RequestInit
): Promise<unknown> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    if (res.status === 401) throw new UnauthenticatedError();
    throw await ProblemDetailsError.fromResponse(res);
  }
  return res.status === 204 ? null : res.json();
}
```

### Why openapi-typescript

- Generates only types, no runtime client. The hand-written `apiFetch` is small and standard.
- Catches schema drift at compile time.
- Standard tool in the JS ecosystem.

### Why not `orval` / `openapi-fetch` runtime clients

- Adds runtime dependency.
- Generates large client classes per endpoint — bloat.
- Hand-written `apiFetch` is ~30 lines and covers Cinereel's surface.

### What's NOT in V1

- Auto-generated React Query hooks (we'll hand-write those as needed).
- Mock server for testing without a live API.
- Per-endpoint typed error responses (we only type success bodies).

## Trade-off accepted

- The build depends on a running App Server (or a fixture). CI provides the fixture.
- A breaking server change breaks the web build. This is the desired effect — drift is caught early.
- The web UI's API contract is implicit in the generated types file. Treat it as generated code (don't edit by hand).