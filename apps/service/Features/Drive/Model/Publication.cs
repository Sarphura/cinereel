namespace Cinereel.Features.Drive;

public sealed record Publication(
    Guid Id,
    string DriveId,
    PublicationStatus Status,
    PublicationFailure? Failure,
    DateTimeOffset CreatedAt,
    DateTimeOffset StatusChangedAt);

public enum PublicationStatus
{
    Publishing,
    Published,
    Unpublishing,
    Failed,
    Unpublished
}

public sealed record PublicationFailure(
    PublicationActionType Action,
    string Code,
    string Message,
    DateTimeOffset FailedAt,
    int AttemptCount);

public enum PublicationActionType
{
    Publish,
    Unpublish
}
