using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Subscription;
using Microsoft.EntityFrameworkCore;

namespace CineReel.Service.Data.Repositories;

public sealed class EfSubscriptionRepository(CinereelDbContext db) : ISubscriptionRepository
{
    public Task<SubscriptionEntity?> FindByDriveKeyAsync(DriveKey driveKey, CancellationToken cancellationToken = default) => db.Subscriptions.SingleOrDefaultAsync(item => item.DriveKey == driveKey.Value, cancellationToken);
    public Task<SubscriptionEntity?> FindByIdAsync(SubscriptionId id, CancellationToken cancellationToken = default) => db.Subscriptions.FindAsync([id.Value], cancellationToken).AsTask();
    public async Task<IReadOnlyList<SubscriptionEntity>> ListAsync(CancellationToken cancellationToken = default) => await db.Subscriptions.AsNoTracking().ToListAsync(cancellationToken);
    public async Task<IReadOnlyList<SubscriptionEntity>> ListActiveAsync(CancellationToken cancellationToken = default) => await db.Subscriptions.AsNoTracking().Where(item => item.State == SubscriptionState.Active).ToListAsync(cancellationToken);
    public async Task<SubscriptionEntity> AddAsync(SubscriptionEntity subscription, CancellationToken cancellationToken = default) { db.Subscriptions.Add(subscription); await db.SaveChangesAsync(cancellationToken); return subscription; }
    public async Task MarkRemountedAsync(DriveKey driveKey, DateTimeOffset at, CancellationToken cancellationToken = default) { var item = await FindByDriveKeyAsync(driveKey, cancellationToken); if (item is not null) { item.LastRemountedAt = at; await db.SaveChangesAsync(cancellationToken); } }
    public async Task MarkDescriptorSeenAsync(SubscriptionId id, DateTimeOffset at, CancellationToken cancellationToken = default) { var item = await db.Subscriptions.FindAsync([id.Value], cancellationToken).AsTask(); if (item is not null) { item.LastDescriptorSeenAt = at; await db.SaveChangesAsync(cancellationToken); } }
    public async Task RemoveAsync(SubscriptionId id, CancellationToken cancellationToken = default) { var item = await FindByIdAsync(id, cancellationToken); if (item is not null) { db.Subscriptions.Remove(item); await db.SaveChangesAsync(cancellationToken); } }
}
