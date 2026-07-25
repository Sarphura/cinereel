using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Bt;
using Microsoft.EntityFrameworkCore;

namespace CineReel.Service.Data.Repositories;

public sealed class EfTorrentFileRepository(CinereelDbContext db) : ITorrentFileRepository
{
    public Task<TorrentFileEntity?> FindByMediaItemIdAsync(MediaItemId id, CancellationToken cancellationToken = default) => db.TorrentFiles.FindAsync([id.Value], cancellationToken).AsTask();
    public async Task<IReadOnlyList<TorrentFileEntity>> ListBySubscriptionAsync(SubscriptionId id, CancellationToken cancellationToken = default) => await db.TorrentFiles.AsNoTracking().Include(item => item.MediaItem).Where(item => item.MediaItem!.SubscriptionId == id.Value).ToListAsync(cancellationToken);
    public async Task<IReadOnlyList<TorrentFileEntity>> ListAllAsync(CancellationToken cancellationToken = default) => await db.TorrentFiles.AsNoTracking().Include(item => item.MediaItem).ToListAsync(cancellationToken);
    public async Task<TorrentFileEntity> UpsertAsync(TorrentFileEntity torrent, CancellationToken cancellationToken = default) { db.TorrentFiles.Update(torrent); await db.SaveChangesAsync(cancellationToken); return torrent; }
    public async Task RemoveAsync(MediaItemId id, CancellationToken cancellationToken = default) { var item = await FindByMediaItemIdAsync(id, cancellationToken); if (item is not null) { db.TorrentFiles.Remove(item); await db.SaveChangesAsync(cancellationToken); } }
}
