namespace Cinereel.Features.Drive;

public sealed record PublicationFailure(
    PublicationActionType Action,
    string Code,
    string Message,
    DateTimeOffset FailedAt,
    int AttemptCount);
