# 02 — In-process Domain Event Bus (IDomainEvent + IDomainEventBus + IDomainEventHandler + InProcessDomainEventBus)

**What to build:** The Cinereel in-process event surface from ADR 0025 / 0035. `IDomainEvent` is a marker interface. `IDomainEventBus.PublishAsync<TEvent>(TEvent evt, CancellationToken ct)` resolves all registered `IDomainEventHandler<TEvent>` from DI and invokes them sequentially in registration order, awaiting each. A handler that itself publishes an event sees its handlers run *after* the current `await` chain completes (nested ordering). The bus is the single collaboration surface between feature modules. Today nothing exists; this ticket creates the seam.

**Blocked by:** None — can start immediately (runs in parallel with 01).

**Status:** ready-for-agent

- [ ] `Events/IDomainEvent.cs`, `IDomainEventBus.cs`, `IDomainEventHandler.cs` interfaces defined
- [ ] `Events/InProcessDomainEventBus.cs` resolves handlers via `IServiceProvider` and awaits them in registration order
- [ ] DI registration helper `AddDomainEvents(IEnumerable<Assembly> assemblies)` scans the assemblies and registers every `IDomainEventHandler<T>` it finds
- [ ] Unit tests in `Events.UnitTests/InProcessDomainEventBusTests.cs` prove sequential ordering, nested-event ordering, and that a second handler registered later runs second
- [ ] No real event types yet — tests use throwaway `TestEventA` / `TestEventB`
- [ ] Existing code paths compile unchanged; no call site uses the bus yet
