using CineReel.Service.Data.Entities;

namespace CineReel.Service.Features.Accounts;

public interface ISessionRepository
{
    Task<SessionEntity?> FindByTokenAsync(string token, CancellationToken cancellationToken = default);
    Task AddAsync(SessionEntity session, CancellationToken cancellationToken = default);
    Task SaveAsync(SessionEntity session, CancellationToken cancellationToken = default);
    Task RemoveAsync(string token, CancellationToken cancellationToken = default);
    Task<int> RemoveExpiredAsync(DateTimeOffset now, CancellationToken cancellationToken = default);
}

public sealed class InMemorySessionRepository : ISessionRepository
{
    private readonly Dictionary<string, SessionEntity> _items = new(StringComparer.Ordinal);
    public Task<SessionEntity?> FindByTokenAsync(string token, CancellationToken cancellationToken = default) => Task.FromResult(_items.GetValueOrDefault(token));
    public Task AddAsync(SessionEntity session, CancellationToken cancellationToken = default) { _items[session.Token] = session; return Task.CompletedTask; }
    public Task SaveAsync(SessionEntity session, CancellationToken cancellationToken = default) { _items[session.Token] = session; return Task.CompletedTask; }
    public Task RemoveAsync(string token, CancellationToken cancellationToken = default) { _items.Remove(token); return Task.CompletedTask; }
    public Task<int> RemoveExpiredAsync(DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var expired = _items.Values.Where(item => item.ExpiresAt < now).Select(item => item.Token).ToList();
        foreach (var token in expired) _items.Remove(token);
        return Task.FromResult(expired.Count);
    }
}
