# In-process event bus dispatches handlers sequentially; publisher awaits completion

`InProcessDomainEventBus.PublishAsync<TEvent>` resolves all registered `IDomainEventHandler<TEvent>` from DI, then invokes each handler sequentially with `await`. The publisher's `await PublishAsync(...)` blocks until every handler returns. A handler that itself publishes another event (via `IDomainEventBus.PublishAsync`) sees its event handled after the current handler's `await` chain completes.

## Context

After ADR 0025 fixed the bus as in-process and ADR 0027 fixed retry semantics, the remaining question is dispatch ordering. Three plausible shapes:

- **Sequential, awaited** — the publisher waits for all handlers to complete. Handlers run one after another.
- **Fire-and-forget** — publisher returns immediately; handlers run on background threads. Low latency but harder to debug.
- **Task-schedule via Channel<T>** — handlers are pushed to a `Channel<T>`, consumed by background workers. Decouples handler lifetime from publisher but adds complexity.

## Decision

Sequential and awaited. The bus implementation:

```csharp
namespace Cinereel.Events;

public sealed class InProcessDomainEventBus : IDomainEventBus
{
    private readonly IServiceProvider _serviceProvider;

    public InProcessDomainEventBus(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task PublishAsync<TEvent>(TEvent evt, CancellationToken ct)
        where TEvent : IDomainEvent
    {
        var handlers = _serviceProvider.GetServices<IDomainEventHandler<TEvent>>().ToList();
        foreach (var handler in handlers)
        {
            await handler.HandleAsync(evt, ct).ConfigureAwait(false);
        }
    }
}
```

### Properties

- **Determinism**: handlers run in DI registration order. A developer adding a new handler at the end of a feature's DI registration block can predict the order.
- **Synchronous error propagation**: if any handler throws, the publisher's `await` rethrows. The publisher decides whether to retry or mark `failed`.
- **Nested event ordering**: if `HandlerA.HandleAsync` calls `await _bus.PublishAsync(EventB)`, EventB's handlers run *after* HandlerA completes (because HandlerA is awaited in the bus loop). This means EventB's effects happen-after EventA's effects.

### What is NOT in V1

- Parallel handler invocation.
- Background dispatch via `Channel<T>`.
- Async fire-and-forget.

## Trade-off accepted

- A slow handler delays the publisher. For Cinereel V1, handlers are short (file writes, DB updates, BT schedule kicks). Acceptable.
- Sequential dispatch means there's no parallel speedup if multiple handlers are CPU-bound. None of our V1 handlers are CPU-bound.
- Nested `PublishAsync` calls can produce surprising ordering for newcomers (EventB is "inside" HandlerA's chain). We accept this because it matches the natural reading of the code.