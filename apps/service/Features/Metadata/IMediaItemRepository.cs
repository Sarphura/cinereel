using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;

namespace CineReel.Service.Features.Metadata;

public interface IMediaItemRepository
{
    Task<MediaItemEntity?> FindByIdAsync(MediaItemId id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<MediaItemEntity>> ListBySubscriptionAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default);
    Task<MediaItemEntity> UpsertAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default);
    Task RemoveAsync(MediaItemId id, CancellationToken cancellationToken = default);
}

public sealed class InMemoryMediaItemRepository : IMediaItemRepository
{
    private readonly Dictionary<int, MediaItemEntity> _items = [];
    private readonly object _gate = new();
    private int _nextId = 1;

    public Task<MediaItemEntity?> FindByIdAsync(MediaItemId id, CancellationToken cancellationToken = default)
    {
        lock (_gate) return Task.FromResult(_items.GetValueOrDefault(id.Value));
    }
    public Task<IReadOnlyList<MediaItemEntity>> ListBySubscriptionAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default)
    {
        lock (_gate) return Task.FromResult<IReadOnlyList<MediaItemEntity>>(_items.Values.Where(item => item.SubscriptionId == subscriptionId.Value).ToList());
    }
    public Task<MediaItemEntity> UpsertAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            var existing = _items.Values.SingleOrDefault(item => item.SubscriptionId == mediaItem.SubscriptionId && item.DrivePath == mediaItem.DrivePath);
            if (existing is not null)
            {
                mediaItem.Id = existing.Id;
                _items[existing.Id] = mediaItem;
                return Task.FromResult(mediaItem);
            }
            mediaItem.Id = mediaItem.Id == 0 ? _nextId++ : mediaItem.Id;
            _items[mediaItem.Id] = mediaItem;
            return Task.FromResult(mediaItem);
        }
    }
    public Task RemoveAsync(MediaItemId id, CancellationToken cancellationToken = default) { lock (_gate) _items.Remove(id.Value); return Task.CompletedTask; }
}
