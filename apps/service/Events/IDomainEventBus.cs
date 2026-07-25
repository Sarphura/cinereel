namespace CineReel.Service.Events;

public interface IDomainEventBus
{
    Task PublishAsync<TEvent>(TEvent evt, CancellationToken cancellationToken = default)
        where TEvent : IDomainEvent;
}
