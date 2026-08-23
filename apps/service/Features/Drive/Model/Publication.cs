namespace Cinereel.Features.Drive;

public sealed record Publication(
    Guid Id,
    string DriveId,
    PublicationStatus Status,
    PublicationFailure? Failure,
    DateTimeOffset CreatedAt,
    DateTimeOffset StatusChangedAt);
