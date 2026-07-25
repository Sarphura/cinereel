# Domain Event handler failures use exponential backoff for recoverable errors, fallback polling for everything else

Domain Event handlers may fail in three classes: (1) transient recoverable, (2) resource recoverable, (3) non-recoverable. The Application Server treats them differently:

- **(1) and (2)** raise `RecoverableException` → the in-process bus retries up to 3 times with exponential backoff (200ms / 1s / 5s).
- **(3)** raises `NonRecoverableException` (or any other exception) → the handler is not retried; the affected entity is marked `failed` in SQLite.
- All `failed` entities are polled by a background sweep every 60 seconds and retried once per cycle.

## Context

A grilling question asked about retry semantics for `SubscriptionCreated`, `MediaItemScanned`, and other in-process events. The Application Server's handlers are short and idempotent, so a retry mechanism is mostly to ride out transient failures (Hyper Agent RPC timeouts during heavy I/O, Jellyfin HTTP unavailability, BT tracker hiccups). Permanent failures (NFO corruption, schema mismatch) need a different path: surface to the user and let them decide.

## Decision

### Exception hierarchy

```csharp
namespace Cinereel.Events;

public abstract class HandlerException : Exception
{
    protected HandlerException(string message, Exception? inner = null)
        : base(message, inner) { }
}

public sealed class RecoverableException : HandlerException
{
    public TimeSpan RetryAfter { get; }
    public RecoverableException(string message, TimeSpan retryAfter, Exception? inner = null)
        : base(message, inner) { RetryAfter = retryAfter; }
}

public sealed class NonRecoverableException : HandlerException
{
    public NonRecoverableException(string message, Exception? inner = null)
        : base(message, inner) { }
}
```

### In-process bus behaviour

`InProcessDomainEventBus` catches `RecoverableException` and:

1. Sleeps `RetryAfter`.
2. Re-invokes the same handler.
3. Repeats up to 3 times.
4. On the 4th failure, marks the affected entity (looked up via the event payload's `EntityId`) as `failed` in SQLite.

Other exception types skip retries and immediately mark `failed`.

### Background sweep

`FailedEntitySweeper : BackgroundService` runs every 60 seconds:

1. Queries all `media_items` and `subscriptions` with `state = 'failed'`.
2. For each, re-runs the action that originally failed (e.g. re-pushes to Jellyfin).
3. Resets the state to its non-failed value on success.

### Surfacing to users

The web UI's poster wall shows a small warning icon on items in `failed` state. Clicking the icon opens a detail panel with the failure reason and a "Retry now" button that triggers an immediate re-run (bypassing the 60-second cycle).

## Trade-off accepted

- 3 retries × max 5s = 15 seconds of synchronous delay inside the publisher. Acceptable because publishers are user-triggered HTTP requests or background tasks, neither of which is latency-critical.
- The 60-second sweep is somewhat arbitrary. We accept this as a reasonable balance between recovery latency and CPU idle time.
- Handlers must be idempotent because retries can re-run side-effects. This is enforced by code review and an automated test that exercises each handler twice with the same event payload.