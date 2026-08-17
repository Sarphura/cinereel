using CineReel.Service.Domain.Common;
using CineReel.Service.Events;

namespace CineReel.Service.Features.Subscription.Events;

/// <summary>
/// Fired when a subscription row is inserted. The scanner and
/// future Jellyfin pusher consume this event to materialize
/// downstream state.
/// </summary>
public sealed record SubscriptionCreated(
    SubscriptionId Id,
    DriveKey DriveKey,
    DateTimeOffset SubscribedAt) : IDomainEvent;

/// <summary>
/// Fired when a subscription row is removed. Consumers must cascade any
/// derived state (scanner caches, Jellyfin entries, peer mounts).
/// </summary>
public sealed record SubscriptionDeleted(
    SubscriptionId Id,
    DriveKey DriveKey,
    DateTimeOffset DeletedAt) : IDomainEvent;
