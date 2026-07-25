# 04 — EF Core DbContext, entities, and InitialCreate migration (subscriptions, media_items, torrent_files, accounts, sessions)

**What to build:** The Cinereel SQLite schema from ADR 0008 + 0037 lands as an EF Core `DbContext` with the six entities (`SubscriptionEntity`, `MediaItemEntity`, `TorrentFileEntity`, `AccountEntity`, `SessionEntity`, `PermissionEntity`) and an `InitialCreate` migration that matches the documented table shapes plus the scanner's `media_items.descriptor_hash TEXT NOT NULL` field. Indices are added exactly as documented: `media_items(imdb_id)`, `media_items(drive_key, drive_path)`, `media_items(jellyfin_state)`, `subscriptions(state)`, `sessions(account_id)`, `sessions(expires_at)`. `Database:Path` overrides the default `<CINEREEL_DATA_DIR>/cinereel.db`. The DbContext is the seam every repository implementation plugs into. Today nothing is persisted.

**Blocked by:** 01 (value objects referenced by entities)

**Status:** ready-for-agent

- [ ] `Data/CinereelDbContext.cs` declares the six `DbSet<>` properties and configures column types / nullability / indices via `OnModelCreating`
- [ ] `Data/Entities/SubscriptionEntity.cs` etc. with snake-case columns matching ADR 0008/0037, plus `media_items.descriptor_hash TEXT NOT NULL`
- [ ] `Data/Migrations/InitialCreate.cs` produces a schema diff of zero against the ADR 0008 table shape (verified by an xUnit assertion that opens the migration SQL and asserts column names)
- [ ] `CinereelOptions.Database:Path` binding wired in `Program.cs`; default `<CINEREEL_DATA_DIR>/cinereel.db` resolved at startup
- [ ] `Microsoft.EntityFrameworkCore.Sqlite` 10.x added to the `.csproj`
- [ ] Unit test: `DbContextTests.cs` opens an in-memory SQLite, runs `MigrateAsync()`, asserts every expected table exists with the documented column names and indices
- [ ] The existing `apps/service/Infrastructure/HyperAgent/InMemorySubscriptionStore` is unchanged (migrated to use the new repo interface in a later ticket)
