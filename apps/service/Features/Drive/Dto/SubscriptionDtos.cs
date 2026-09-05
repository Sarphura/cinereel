namespace Cinereel.Features.Drive;

public sealed record CreateSubscriptionRequest(string? DriveKey);

public sealed record CreateSubscriptionResult(
    CreateSubscriptionResultCode ResultCode,
    DriveDescriptionResponse? Description = null);

public enum CreateSubscriptionResultCode
{
    Created,
    Replayed,
    RelationshipConflict,
    ManifestMissing,
    InvalidManifest,
    ManifestTooLarge,
    UnsupportedSchema,
    UnsupportedContentType,
    ContentUnavailable,
    Timeout
}

public sealed record RefreshSubscriptionResult(
    RefreshSubscriptionResultCode ResultCode,
    DriveDescriptionResponse? Description = null);

public enum RefreshSubscriptionResultCode
{
    Refreshed,
    NotFound,
    ManifestMissing,
    InvalidManifest,
    ManifestTooLarge,
    UnsupportedSchema,
    UnsupportedContentType,
    ContentUnavailable,
    Timeout
}

public enum DeleteSubscriptionResultCode
{
    Deleted,
    NotFound
}
