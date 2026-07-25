using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Metadata;
using Microsoft.EntityFrameworkCore;

namespace CineReel.Service.Data.Repositories;

public sealed class EfMediaItemRepository(CinereelDbContext db) : IMediaItemRepository
{
    public Task<MediaItemEntity?> FindByIdAsync(MediaItemId id, CancellationToken cancellationToken = default) => db.MediaItems.FindAsync([id.Value], cancellationToken).AsTask();
    public async Task<IReadOnlyList<MediaItemEntity>> ListBySubscriptionAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default) => await db.MediaItems.AsNoTracking().Where(item => item.SubscriptionId == subscriptionId.Value).ToListAsync(cancellationToken);
    public async Task<IReadOnlyList<MediaItemEntity>> ListAllAsync(CancellationToken cancellationToken = default) => await db.MediaItems.AsNoTracking().ToListAsync(cancellationToken);
    public async Task<MediaItemEntity> UpsertAsync(MediaItemEntity mediaItem, CancellationToken cancellationToken = default)
    {
        var existing = await db.MediaItems.SingleOrDefaultAsync(item => item.SubscriptionId == mediaItem.SubscriptionId && item.DrivePath == mediaItem.DrivePath, cancellationToken);
        if (existing is null) db.MediaItems.Add(mediaItem); else { mediaItem.Id = existing.Id; db.Entry(existing).CurrentValues.SetValues(mediaItem); }
        await db.SaveChangesAsync(cancellationToken);
        return existing ?? mediaItem;
    }
    public async Task RemoveAsync(MediaItemId id, CancellationToken cancellationToken = default) { var item = await FindByIdAsync(id, cancellationToken); if (item is not null) { db.MediaItems.Remove(item); await db.SaveChangesAsync(cancellationToken); } }
}
