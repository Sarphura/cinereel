# 05 — Repository interfaces + InMemory implementations (ISubscriptionRepository, IMediaItemRepository, ITorrentFileRepository, IAccountRepository, ISessionRepository)

**What to build:** Every aggregate root gets a repository interface in its feature folder and an `InMemory*` implementation backed by `List<T>` or `Dictionary<,>` keyed by primary key. EF Core-backed `Ef*Repository` classes live in `Data/Repositories/` and are registered separately. The InMemory implementations are the unit-test seam; the EF Core implementations are the production seam. Every feature service consumes the interface, not the DbContext directly. Today the only repository-shaped thing is the existing `ISubscriptionStore` stub; this ticket redefines and broadens that surface.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `Features/Subscription/ISubscriptionRepository.cs` with `FindByDriveKeyAsync`, `FindByIdAsync`, `ListActiveAsync`, `AddAsync`, `MarkRemountedAsync`, `RemoveAsync`
- [ ] `Features/Subscription/InMemorySubscriptionRepository.cs` (List<SubscriptionEntity>-backed)
- [ ] `Data/Repositories/EfSubscriptionRepository.cs` consumes `CinereelDbContext`
- [ ] Same shape for `IMediaItemRepository` (with `UpsertAsync(subscriptionId, drivePath, ...)` for the no-duplicate guarantee), `ITorrentFileRepository`, `IAccountRepository`, `ISessionRepository`
- [ ] DI registration helper binds each `IXxxRepository` to `EfXxxRepository` in production and to `InMemoryXxxRepository` in tests via `[FromKeyedServices]` or a configuration switch
- [ ] The existing `ISubscriptionStore` and `InMemorySubscriptionStore` are folded into `ISubscriptionRepository`; `SubscriptionRecoveryService` is migrated to the new interface (no behaviour change)
- [ ] Unit tests in `Data.UnitTests/Repositories/*` prove CRUD round-trips and the `(subscriptionId, drivePath)` unique invariant on media items
