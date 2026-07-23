# Application Server is "low-end DDD": Vertical Slices + Value Objects + Repository interfaces + Domain Events

The C# Application Server is organised by feature (Vertical Slices, ADR 0019) and additionally applies four lightweight DDD patterns where they pay off in V1:

1. **Value Objects for all identity types** — `DriveKey`, `Infohash`, `SubscriptionId`, `MediaItemId`, `TorrentPath`. Strongly typed `record`s with validation, not naked strings.
2. **Repository interfaces per aggregate root** — `ISubscriptionRepository` etc., with EF Core implementations living in `data/`. Services consume the interface, not the DbContext.
3. **Domain Events** — `SubscriptionCreated`, `SubscriptionDeleted`, `MediaItemScanned`, `MediaItemAddedToJellyfin`. The Application Server has a thin in-process event bus; handlers in `jellyfin/`, `bt/`, and `metadata/` subscribe.
4. **No formal Aggregate boundaries** beyond what EF Core already enforces via cascading deletes. `Subscription + MediaItem + TorrentFile` is treated as one logical aggregate without an explicit aggregate-root class.

## Context

After Q34 selected "human decides" for the internal architecture, this ADR pulls the discussion forward by spelling out what "low-end DDD" means concretely.

DDD's full toolkit includes Aggregates, Bounded Contexts, Domain Services, Specifications, and Event Sourcing. For a V1 application of Cinereel's size, several of these are over-engineering. But a subset — Value Objects, Repositories, Domain Events — provides real value at low cost.

## Decision

### Value Objects

```csharp
public readonly record struct DriveKey
{
    public string Hex { get; }
    public DriveKey(string hex) {
        if (!System.Text.RegularExpressions.Regex.IsMatch(hex, "^[0-9a-f]{64}$"))
            throw new ArgumentException("driveKey must be 64-hex", nameof(hex));
        Hex = hex;
    }
}

public readonly record struct Infohash
{
    public string Hex { get; }
    public Infohash(string hex) {
        if (!System.Text.RegularExpressions.Regex.IsMatch(hex, "^[0-9a-f]{40}$"))
            throw new ArgumentException("infohash must be 40-hex", nameof(hex));
        Hex = hex;
    }
}
```

`MediaItemId` and `SubscriptionId` are `record struct` wrapping `int` (SQLite row IDs). All Value Objects serialize to their string form when crossing the HTTP boundary.

### Repository interfaces

```csharp
public interface ISubscriptionRepository
{
    Task<Subscription?> FindByDriveKeyAsync(DriveKey key, CancellationToken ct);
    Task AddAsync(Subscription subscription, CancellationToken ct);
    Task<List<Subscription>> ListActiveAsync(CancellationToken ct);
    Task SaveChangesAsync(CancellationToken ct);
}
```

Implementations live in `data/Repositories/EfSubscriptionRepository.cs` and consume the DbContext directly. Tests use `InMemorySubscriptionRepository` (a simple `List<Subscription>`-backed implementation).

### Domain Events

A simple in-process bus:

```csharp
public interface IDomainEventBus
{
    Task PublishAsync<TEvent>(TEvent evt, CancellationToken ct) where TEvent : IDomainEvent;
}

public interface IDomainEventHandler<TEvent> where TEvent : IDomainEvent
{
    Task HandleAsync(TEvent evt, CancellationToken ct);
}
```

Handlers are registered via DI. Example:

- `SubscriptionCreated` → `SubscriptionScanningOrchestrator` starts a scan.
- `MediaItemScanned` → `JellyfinPusher` pushes NFO + poster + (later) torrent to the Jellyfin library root.
- `MediaItemRemovedFromSubscription` → `JellyfinPusher` removes the corresponding folder from the Jellyfin library root.

The event bus is in-process only. V2 may add an out-of-process bus (e.g. for distributed setups).

### What is NOT introduced

- **Aggregate boundary classes**: there's no explicit `SubscriptionAggregate` class wrapping `Subscription + MediaItem + TorrentFile`. EF Core's `ON DELETE CASCADE` plus the SQLite schema (ADR 0008) enforces the strong-consistency boundary already.
- **Bounded Context**: the application is small enough that "Cinereel" is one bounded context.
- **Domain Service classes**: cross-aggregate logic that doesn't fit a feature service is currently nonexistent; we'll introduce one when needed.
- **Event Sourcing**: events are emitted but not stored as the source of truth. EF Core entities are.
- **Specifications**: query filters live in repository methods directly.
- **CQRS**: read paths share the same DbContext as write paths.

## Trade-off accepted

- The Domain Event bus is in-process, so handlers run synchronously with the publisher. If a handler is slow (e.g. Jellyfin push), the publisher waits. This is acceptable in V1 because handlers are short.
- Value Objects add ~50 lines of code; they pay off in type safety but require conversion at HTTP boundaries (DTOs use strings).
- Repository interfaces add a layer of indirection — `InMemorySubscriptionRepository` and `EfSubscriptionRepository` must both be tested.

## Migration path

If V2 introduces distributed deployment, the in-process bus can be replaced by a real message broker behind the same `IDomainEventBus` interface. Aggregate boundaries can be introduced if EF Core cascading proves insufficient.
