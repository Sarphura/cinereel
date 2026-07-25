using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;

namespace CineReel.Service.Features.Subscription;

public sealed class InMemorySubscriptionRepository : ISubscriptionRepository
{
    private readonly Dictionary<int, SubscriptionEntity> _items = [];
    private int _nextId = 1;

    public Task<SubscriptionEntity?> FindByDriveKeyAsync(DriveKey driveKey, CancellationToken cancellationToken = default) =>
        Task.FromResult(_items.Values.SingleOrDefault(item => item.DriveKey == driveKey.Value));
    public Task<SubscriptionEntity?> FindByIdAsync(SubscriptionId id, CancellationToken cancellationToken = default) =>
        Task.FromResult(_items.GetValueOrDefault(id.Value));
    public Task<IReadOnlyList<SubscriptionEntity>> ListAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<SubscriptionEntity>>(_items.Values.ToList());
    public Task<IReadOnlyList<SubscriptionEntity>> ListActiveAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<SubscriptionEntity>>(_items.Values.Where(item => item.State == SubscriptionState.Active).ToList());
    public Task<SubscriptionEntity> AddAsync(SubscriptionEntity subscription, CancellationToken cancellationToken = default)
    {
        if (_items.Values.Any(item => item.DriveKey == subscription.DriveKey))
            throw new InvalidOperationException("A subscription already exists for this drive key.");
        subscription.Id = subscription.Id == 0 ? _nextId++ : subscription.Id;
        _items[subscription.Id] = subscription;
        return Task.FromResult(subscription);
    }
    public Task MarkRemountedAsync(DriveKey driveKey, DateTimeOffset at, CancellationToken cancellationToken = default)
    {
        var item = _items.Values.SingleOrDefault(candidate => candidate.DriveKey == driveKey.Value);
        if (item is not null) item.LastRemountedAt = at;
        return Task.CompletedTask;
    }
    public Task RemoveAsync(SubscriptionId id, CancellationToken cancellationToken = default)
    {
        _items.Remove(id.Value);
        return Task.CompletedTask;
    }
}
