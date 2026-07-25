using CineReel.Service.Data.Entities;

namespace CineReel.Service.Features.Subscription.Dto;

/// <summary>
/// The shape returned to clients. Includes a stable stringified id and a
/// derived `isSelf` flag — see <see cref="SubscriptionResponseFactory"/>.
/// </summary>
public sealed record SubscriptionResponse(
    int Id,
    string DriveKey,
    string? Alias,
    string State,
    string? FailureReason,
    DateTimeOffset SubscribedAt,
    DateTimeOffset? LastSyncedAt,
    DateTimeOffset? LastDescriptorSeenAt,
    DateTimeOffset? LastRemountedAt,
    bool IsSelf);

public sealed record CreateSubscriptionRequest(string Key, string Type);

public sealed record ProfilePickerEntry(string DriveKey, string Title, int? Year);

public sealed record ProfilePickerResponse(
    string ProfileDriveKey,
    string PublisherName,
    IReadOnlyList<ProfilePickerEntry> Collections);

internal static class SubscriptionResponseFactory
{
    public static SubscriptionResponse FromEntity(SubscriptionEntity entity, bool isSelf)
    {
        return new SubscriptionResponse(
            Id: entity.Id,
            DriveKey: entity.DriveKey,
            Alias: entity.Alias,
            State: entity.State.ToString(),
            FailureReason: entity.FailureReason,
            SubscribedAt: entity.SubscribedAt,
            LastSyncedAt: entity.LastSyncedAt,
            LastDescriptorSeenAt: entity.LastDescriptorSeenAt,
            LastRemountedAt: entity.LastRemountedAt,
            IsSelf: isSelf);
    }
}
