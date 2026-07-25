namespace CineReel.Service.Features.Recovery;

public interface IEntityFailureJournal
{
    Task RecordAsync(string entityType, int entityId, string eventType, string cause, DateTimeOffset when, CancellationToken cancellationToken = default);
    Task<FailureEntry?> FindAsync(string entityType, int entityId, CancellationToken cancellationToken = default);
    Task ClearAsync(string entityType, int entityId, CancellationToken cancellationToken = default);
}

public sealed record FailureEntry(string EntityType, int EntityId, string EventType, string Cause, DateTimeOffset LastAttemptedAt);

public sealed class InMemoryEntityFailureJournal : IEntityFailureJournal
{
    private readonly Dictionary<string, FailureEntry> _entries = new();
    public Task RecordAsync(string entityType, int entityId, string eventType, string cause, DateTimeOffset when, CancellationToken cancellationToken = default)
    {
        _entries[Key(entityType, entityId)] = new FailureEntry(entityType, entityId, eventType, cause, when);
        return Task.CompletedTask;
    }
    public Task<FailureEntry?> FindAsync(string entityType, int entityId, CancellationToken cancellationToken = default) =>
        Task.FromResult(_entries.GetValueOrDefault(Key(entityType, entityId)));
    public Task ClearAsync(string entityType, int entityId, CancellationToken cancellationToken = default)
    {
        _entries.Remove(Key(entityType, entityId));
        return Task.CompletedTask;
    }
    private static string Key(string t, int id) => $"{t}:{id}";
}