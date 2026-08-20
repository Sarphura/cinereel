namespace Cinereel.Features.Publish;

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

public sealed record PublicationResponse(
    Guid Id,
    string DriveId,
    string Status,
    PublicationFailureResponse? Failure,
    DateTimeOffset CreatedAt,
    DateTimeOffset StatusChangedAt)
{
    internal static PublicationResponse From(Publication publication) =>
        new(
            publication.Id,
            publication.DriveId,
            publication.Status.ToString(),
            PublicationFailureResponse.From(publication.Failure),
            publication.CreatedAt,
            publication.StatusChangedAt);
}

public sealed record PublicationFailureResponse(
    string Action,
    string Code,
    string Message,
    DateTimeOffset FailedAt,
    int AttemptCount)
{
    internal static PublicationFailureResponse? From(PublicationFailure? failure) =>
        failure is null
            ? null
            : new(
                failure.Action.ToString(),
                failure.Code,
                failure.Message,
                failure.FailedAt,
                failure.AttemptCount);
}
