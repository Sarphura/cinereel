namespace Cinereel.Features.Drive;

public sealed record PublicationCommandResult(
    PublicationCommandResultCode ResultCode,
    Publication? Publication);

public enum PublicationCommandResultCode
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
