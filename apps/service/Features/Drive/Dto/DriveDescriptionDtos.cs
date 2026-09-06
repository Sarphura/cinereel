namespace Cinereel.Features.Drive;

public sealed record UpdateDriveDescriptionRequest(
    string? Name,
    string? Description,
    long ExpectedRevision);

public sealed record DriveDescriptionResponse(
    Guid DriveId,
    string Name,
    string ContentTypeId,
    string Description,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    long Revision,
    long SyncedRevision,
    string SyncStatus,
    string? ErrorCode);
