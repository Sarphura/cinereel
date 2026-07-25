# EF Core migrations are auto-applied at App Server startup

The .NET Application Server runs `dbContext.Database.MigrateAsync()` during startup, after the Hyper Agent readiness check passes but before the App Server begins serving HTTP. Pending migrations are applied in order. A migration failure aborts startup with a clear error.

## Context

After ADR 0008 chose SQLite + EF Core for the subscription registry, the question becomes how schema changes ship to users. Three plausible shapes:

- **EF Core Migrations, manual apply** — operator runs `dotnet ef database update` before launching the new App Server.
- **EF Core Migrations, auto apply on startup** — App Server detects pending migrations and applies them.
- **Hand-written SQL with a schema version table** — bypasses EF Core entirely.

## Decision

EF Core Migrations, auto-apply on startup.

### Sequence

1. App Server starts.
2. App Server spawns Hyper Agent (ADR 0017) and waits for `/health`.
3. App Server calls `await dbContext.Database.MigrateAsync(ct)`.
4. EF Core reads the `__EFMigrationsHistory` table; pending migrations are applied in order.
5. App Server begins serving HTTP.

### Failure modes

- Migration SQL fails (e.g. disk full, schema corruption): App Server logs the error and exits non-zero. Operator must intervene before retry.
- Migration takes too long (e.g. >5 minutes for a big data migration): App Server logs progress every 30 seconds and continues. The user is expected to wait.

### What is NOT in V1

- Rollback migrations. EF Core's `MigrateAsync` only goes forward. If a bad migration ships, V1 requires a manual `dotnet ef migrations remove` and a fresh database. V2 will add a proper rollback strategy.
- Multi-version migration batches (e.g. step 1 to v5, step 2 to v6). All migrations apply at once.

## Trade-off accepted

- Auto-apply on startup couples schema upgrade to App Server upgrade. Users can't deploy a new App Server without a working database. Acceptable because migrations are idempotent and forward-only.
- A failed migration puts the App Server in an unrecoverable state. Acceptable because the error is logged and the operator can intervene.