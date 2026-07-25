namespace CineReel.Service.Events;

public interface IEntityDomainEvent : IDomainEvent
{
    string EntityType { get; }
    object EntityId { get; }
}

public interface IEntityFailureMarker
{
    Task MarkFailedAsync(
        string entityType,
        object entityId,
        Exception cause,
        CancellationToken cancellationToken);
}
