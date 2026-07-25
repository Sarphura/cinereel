using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Subscription.Dto;

namespace CineReel.Service.Features.Subscription;

public interface ISubscriptionService
{
    Task<SubscriptionEntity> CreateFromDriveKeyAsync(string driveKey, string? alias, CancellationToken cancellationToken = default);
    Task<Dto.ProfilePickerResponse> ListCollectionsForProfileAsync(string profileKey, CancellationToken cancellationToken = default);
    Task<SubscriptionEntity> CreateFromProfileKeyAsync(string profileKey, string driveKey, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SubscriptionEntity>> ListAsync(CancellationToken cancellationToken = default);
    Task<SubscriptionEntity?> GetAsync(SubscriptionId id, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(SubscriptionId id, CancellationToken cancellationToken = default);
    Task MarkFailedAsync(SubscriptionId id, string reason, CancellationToken cancellationToken = default);
    Task MarkActiveAsync(SubscriptionId id, CancellationToken cancellationToken = default);
    Task<Dto.SubscriptionResponse> ToResponseAsync(SubscriptionEntity entity, CancellationToken cancellationToken = default);
}

/// <summary>
/// Specific exception type callers map to HTTP responses. The endpoints
/// distinguish between invalid input (400), missing drive mounts (404),
/// and duplicate subscriptions (409).
/// </summary>
public sealed class SubscriptionServiceException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
    public const string InvalidDriveKey = "invalid-drive-key";
    public const string DriveNotMounted = "drive-not-mounted";
    public const string Duplicate = "duplicate-subscription";
    public const string NotFound = "subscription-not-found";
    public const string MountFailed = "mount-failed";
}
