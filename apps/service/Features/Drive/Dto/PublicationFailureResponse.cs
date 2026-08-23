namespace Cinereel.Features.Drive;

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
