using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Events;

public sealed class InProcessDomainEventBus(IServiceProvider services) : IDomainEventBus
{
    public async Task PublishAsync<TEvent>(TEvent evt, CancellationToken cancellationToken = default)
        where TEvent : IDomainEvent
    {
        var handlers = services.GetServices<IDomainEventHandler<TEvent>>();
        foreach (var handler in handlers)
        {
            await handler.HandleAsync(evt, cancellationToken);
        }
    }
}
