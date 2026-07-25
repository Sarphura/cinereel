namespace CineReel.Service.Data.Entities;

public enum SubscriptionState { Pending, Active, Failed }

public sealed class SubscriptionEntity
{
    public int Id { get; set; }
    public required string DriveKey { get; set; }
    public string? Alias { get; set; }
    public SubscriptionState State { get; set; } = SubscriptionState.Pending;
    public string? FailureReason { get; set; }
    public DateTimeOffset SubscribedAt { get; set; }
    public DateTimeOffset? LastSyncedAt { get; set; }
    public DateTimeOffset? LastDescriptorSeenAt { get; set; }
    public DateTimeOffset? LastRemountedAt { get; set; }
    public ICollection<MediaItemEntity> MediaItems { get; set; } = [];
}
