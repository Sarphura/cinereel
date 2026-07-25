# Application Server uses Vertical Slices with shared data + infrastructure layers

**Status: superseded by ADR 0020.** This ADR describes the high-level folder shape; ADR 0020 layers DDD patterns on top.

The C# Application Server is organised by business feature (`subscription/`, `metadata/`, `bt/`, `jellyfin/`, `search/`, `profile/`, `publish/`, `accounts/`, `rbac/`, `hyper-agent/`, `health/`). Each feature owns its service, HTTP endpoints, and DTOs. Cross-cutting concerns (EF Core DbContext, settings, logging, clock) live in `data/` and `infrastructure/` shared directories. HTTP endpoints are Minimal API style (`MapPost` / `MapGet`) registered in each feature's `*Endpoints.cs` file.

## Context

V1 has 12 distinct business capabilities (see CONTEXT.md + ADRs 0002, 0008, 0017, etc.). Picking an internal architecture that scales with that set without over-engineering is the task. Three plausible shapes:

- **Clean Architecture** — strict Entities / UseCases / InterfaceAdapters / Frameworks. Heavier ceremony, multiple projects per layer, more friction for new contributors.
- **Vertical Slices** — one folder per business feature; each folder owns its types. Service classes plus Minimal API endpoints.
- **Pure Minimal API** — endpoints inline, no service classes. Light but mixes layers and becomes hard to test.

## Decision

Vertical Slices with shared `data/` and `infrastructure/`.

```
src/
  Cinereel.Server/                ← ASP.NET Core host, DI wiring, route registration
  features/
    subscription/                 ← subscriptions + media items + torrent refs
    metadata/                     ← NFO parsing, scanning
    bt/                           ← MonoTorrent wrapper, scheduling
    jellyfin/                     ← library push, normalization
    search/                       ← SQLite FTS5, poster wall
    profile/                      ← /profile.json read/write
    publish/                      ← drive creation, Auto-Pack
    accounts/                     ← auth, sessions
    rbac/                         ← permission enum + attribute
    hyper-agent/                      ← OpenAPI client + process lifecycle
    health/                       ← aggregator
  data/
    CinereelDbContext.cs
    Entities/
    Migrations/
  infrastructure/
    Settings.cs
    Logging.cs
    Clock.cs                      ← IClock abstraction for tests
    ProblemDetailsSetup.cs
```

Each feature folder typically contains:

- `IFooService.cs` + `FooService.cs` — domain logic
- `FooEndpoints.cs` — `MapGet` / `MapPost` route mapping
- `Dto/` — request/response DTOs
- Tests: `FooServiceTests.cs` (xUnit) + integration tests in `tests/`

The shared `data/` directory holds the EF Core `DbContext` and entity classes. Each feature depends on the DbContext directly; no separate repository layer is added in V1 (EF Core's `DbSet` already serves as a repository).

## Why Minimal API, not MVC Controllers

- Less boilerplate; one endpoint file per feature is clearer than scattered `[HttpGet]` attributes.
- Native support in .NET 10 with full ASP.NET Core capabilities (route groups, filters, problem details).
- Easy to register a `PermissionAttribute` filter per endpoint group for RBAC.

## Why no separate Domain / Application / Infrastructure projects

V1 is small enough that three .NET projects would be friction without payoff. When V2 adds more features, splitting the Server project is straightforward.

## Trade-off accepted

- EF Core DbContext is consumed directly by feature services. Mocking `DbSet<T>` in tests is harder than mocking a repository interface. We accept this in exchange for less ceremony.
- Feature folders are not enforced at the language level (C# doesn't have module systems). Discipline is required to keep features independent.
