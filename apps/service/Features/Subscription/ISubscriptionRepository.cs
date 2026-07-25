using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;

namespace CineReel.Service.Features.Subscription;

public interface ISubscriptionRepository
{
    Task<SubscriptionEntity?> FindByDriveKeyAsync(DriveKey driveKey, CancellationToken cancellationToken = default);
    Task<SubscriptionEntity?> FindByIdAsync(SubscriptionId id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SubscriptionEntity>> ListAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SubscriptionEntity>> ListActiveAsync(CancellationToken cancellationToken = default);
    Task<SubscriptionEntity> AddAsync(SubscriptionEntity subscription, CancellationToken cancellationToken = default);
    Task MarkRemountedAsync(DriveKey driveKey, DateTimeOffset at, CancellationToken cancellationToken = default);
    Task RemoveAsync(SubscriptionId id, CancellationToken cancellationToken = default);
}
