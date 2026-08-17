using CineReel.Service.Domain.Common;

namespace CineReel.Service.Events;

/// <summary>
/// Emitted when the Hyper Agent signals that it has recovered from a
/// failure and the App Server can resume work on its subscriptions.
/// The recovery handler re-mounts every
/// active subscription.
/// </summary>
public sealed record SubscriptionRecovered(
    SubscriptionId Id,
    string DriveKey,
    string MainDriveKey,
    DateTimeOffset ObservedAt) : IDomainEvent;