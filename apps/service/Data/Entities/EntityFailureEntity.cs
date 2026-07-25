namespace CineReel.Service.Data.Entities;

public sealed class EntityFailureEntity
{
    public int Id { get; set; }
    public required string EntityType { get; set; }
    public int EntityId { get; set; }
    public required string EventType { get; set; }
    public required string Cause { get; set; }
    public DateTimeOffset LastAttemptedAt { get; set; }
}