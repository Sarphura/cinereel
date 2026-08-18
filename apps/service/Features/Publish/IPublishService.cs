namespace Cinereel.Features.Publish;

public interface IPublishService
{
    Task<Publication?> GetAsync(
        string driveId,
        CancellationToken cancellationToken);

    Task<PublicationCommandResult> PublishAsync(
        string driveId,
        CancellationToken cancellationToken);

    Task<PublicationCommandResult> UnpublishAsync(
        string driveId,
        CancellationToken cancellationToken);
}

public sealed record Publication(
    Guid Id,
    string DriveId,
    PublicationStatus Status,
    PublicationFailure? Failure,
    DateTimeOffset CreatedAt,
    DateTimeOffset StatusChangedAt);

public sealed record PublicationFailure(
    PublicationAction Action,
    string Code,
    string Message,
    DateTimeOffset FailedAt,
    int AttemptCount);

public sealed record PublicationCommandResult(
    PublicationCommandOutcome Outcome,
    Publication? Publication);

public enum PublicationStatus
{
    Publishing,
    Published,
    Unpublishing,
    Failed,
    Unpublished
}

public enum PublicationAction
{
    Publish,
    Unpublish
}

public enum PublicationCommandOutcome
{
    Accepted,
    Unchanged,
    DriveNotFound,
    PublicationNotFound,
    Conflict
}
