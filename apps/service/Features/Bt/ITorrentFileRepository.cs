using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;

namespace CineReel.Service.Features.Bt;

public interface ITorrentFileRepository
{
    Task<TorrentFileEntity?> FindByMediaItemIdAsync(MediaItemId id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TorrentFileEntity>> ListBySubscriptionAsync(SubscriptionId id, CancellationToken cancellationToken = default);
    Task<TorrentFileEntity> UpsertAsync(TorrentFileEntity torrent, CancellationToken cancellationToken = default);
    Task RemoveAsync(MediaItemId id, CancellationToken cancellationToken = default);
}

public sealed class InMemoryTorrentFileRepository : ITorrentFileRepository
{
    private readonly Dictionary<int, TorrentFileEntity> _items = [];
    public Task<TorrentFileEntity?> FindByMediaItemIdAsync(MediaItemId id, CancellationToken cancellationToken = default) => Task.FromResult(_items.GetValueOrDefault(id.Value));
    public Task<IReadOnlyList<TorrentFileEntity>> ListBySubscriptionAsync(SubscriptionId id, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<TorrentFileEntity>>(_items.Values.Where(item => item.MediaItem?.SubscriptionId == id.Value).ToList());
    public Task<TorrentFileEntity> UpsertAsync(TorrentFileEntity torrent, CancellationToken cancellationToken = default) { _items[torrent.MediaItemId] = torrent; return Task.FromResult(torrent); }
    public Task RemoveAsync(MediaItemId id, CancellationToken cancellationToken = default) { _items.Remove(id.Value); return Task.CompletedTask; }
}
