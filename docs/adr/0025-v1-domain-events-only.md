# V1 events are Domain Events only; Integration Events deferred to V2

V1 uses an in-process Domain Event bus (`IDomainEventBus`). All events are `IDomainEvent` records raised by feature services and handled by `IDomainEventHandler<TEvent>` implementations registered in DI. No outbox, no external broker, no async dispatch. Integration Events — events that need cross-process durability — are explicitly deferred to V2 when multi-node deployment becomes a real requirement.

## Context

A grilling question asked whether to introduce a two-tier event model (Domain Event for in-process, Integration Event for cross-process) in V1. The two-tier model has real value in distributed systems because:

- Domain Events are part of a unit-of-work (a single transaction commits the aggregate change and raises the event).
- Integration Events must be persisted to an outbox before the transaction commits so that they survive crashes and are redeliverable.

V1 is a single-process, single-host application. The Application Server and the Hyper Sidecar share lifecycle (ADR 0017), and SQLite persists all subscriptions. There is no scenario in V1 where an event must cross a process boundary or survive a crash in a way that the in-process bus cannot handle.

## Decision

### V1 surface

```
namespace Cinereel.Events;

public interface IDomainEvent { }

public interface IDomainEventBus
{
    Task PublishAsync<TEvent>(TEvent evt, CancellationToken ct)
        where TEvent : IDomainEvent;
}

public interface IDomainEventHandler<TEvent> where TEvent : IDomainEvent
{
    Task HandleAsync(TEvent evt, CancellationToken ct);
}
```

Implementation: `InProcessDomainEventBus` resolves all registered `IDomainEventHandler<TEvent>` from DI and invokes them sequentially in registration order. Handlers run synchronously with the publisher; a slow handler delays the publisher.

### Event namespace layout

- `Cinereel.Events` — base interfaces and bus implementation.
- `Cinereel.Subscription.Events` — `SubscriptionCreated`, `SubscriptionDeleted`, `SubscriptionScanned`, `MediaItemAdded`, `MediaItemRemoved`.
- `Cinereel.Bt.Events` — `TorrentManagerStarted`, `TorrentDownloadCompleted`, `TorrentFailed`.
- `Cinereel.Jellyfin.Events` — `JellyfinPushed`, `JellyfinPushFailed`, `JellyfinStale`.

Events live in the publisher's namespace, not in `Cinereel.Events`. This keeps the consumer free to depend on the publisher's namespace without circular references.

### What is NOT in V1

- `IIntegrationEvent` interface.
- Outbox table or outbox dispatcher.
- Async / background dispatch workers.
- Idempotency keys for handlers.
- Cross-process handlers.

### V2 migration path

When V2 adds multi-node deployment:

1. Introduce `IIntegrationEvent : IDomainEvent` in `Cinereel.Events`.
2. Add an `OutboxEntity` to the DbContext; persist Integration Events there.
3. Add a background `OutboxDispatcher` that reads from the outbox table and dispatches via an external broker (Redis, NATS, etc.).
4. Service methods that should raise Integration Events call `IDomainEventBus.PublishAsync` as today; an in-process decorator writes the event to the outbox before publishing.

The feature event types do not change. Only the bus implementation changes.

## Trade-off accepted

- An in-process bus means a crashing Application Server loses any unhandled events. We accept this because the side-effects (e.g. Jellyfin push) are recoverable from the persisted SQLite state on restart.
- Handlers run synchronously. A slow handler delays the publisher. We accept this because all V1 handlers are short (Jellyfin push, BT schedule kick, log line).
- No idempotency keys. If a handler throws and the publisher retries, the handler may run twice. Acceptable in V1 because handlers are idempotent by construction (Jellyfin push is upsert by folder name; BT schedule is idempotent by infohash).