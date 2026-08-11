# 03 — Handler exceptions + retry policy (RecoverableException, NonRecoverableException, HandlerRetryDecorator)

**What to build:** The retry-on-transient-failure mechanism from ADR 0027. Three exception types live in `Events/HandlerException.cs`: `HandlerException : Exception`, `RecoverableException : HandlerException` (carries a `RetryAfter` hint), and `NonRecoverableException : HandlerException`. The bus is wrapped in a decorator `RetryingDomainEventBus` that catches `RecoverableException`, sleeps `RetryAfter`, re-invokes the same handler, and after 3 attempts (exponential 200ms / 1s / 5s with jitter) marks the entity `state = failed` via a callback `IEntityFailureMarker`. Other exception types skip retries and immediately mark `failed`. Today the spec promises retry; nothing implements it.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `Events/HandlerException.cs` with `HandlerException`, `RecoverableException(TimeSpan retryAfter, ...)`, `NonRecoverableException(...)`
- [ ] `Events/RetryingDomainEventBus.cs` wraps `InProcessDomainEventBus` and applies the retry policy
- [ ] `Events/IEntityFailureMarker.MarkFailedAsync(string entityType, object entityId, Exception cause, CancellationToken ct)` interface defined (implementation lands with the persistence ticket 05)
- [ ] DI registration swaps `IDomainEventBus` registration to `RetryingDomainEventBus` so the retry is always on
- [ ] Unit tests with a fake `IEntityFailureMarker` and a fake inner bus: prove 3-retry limit, prove non-Recoverable skips retry, prove jitter window, prove nested events still sequential
- [ ] The retry count and the cause are logged at structured warning level with the event type name
