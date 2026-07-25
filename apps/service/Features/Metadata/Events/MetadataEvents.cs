using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;

namespace CineReel.Service.Features.Metadata.Events;

/// <summary>
/// Emitted by the scanner when a new <c>media_items</c> row is
/// upserted. Listeners include the Jellyfin pusher (ticket 23) and
/// the BT scheduler (ticket 25).
/// </summary>
public sealed record MediaItemAdded(
    MediaItemId Id,
    SubscriptionId SubscriptionId,
    string DriveKey,
    string DrivePath,
    string Title,
    string? ImdbId,
    DateTimeOffset AddedAt) : IDomainEvent;

/// <summary>
/// Emitted when the scanner observes a descriptor hash that
/// differs from the previously stored hash for a subscription.
/// Triggers a re-scan.
/// </summary>
public sealed record SubscriptionDescriptorChanged(
    SubscriptionId SubscriptionId,
    string DriveKey,
    string PreviousHash,
    string CurrentHash,
    DateTimeOffset ObservedAt) : IDomainEvent;
