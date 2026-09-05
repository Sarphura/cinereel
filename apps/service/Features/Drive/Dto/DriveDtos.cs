namespace Cinereel.Features.Drive;

public sealed record CreateDriveRequest(
    string? Name,
    string? ContentTypeId);

public sealed record CreateDriveResult(
    CreateDriveResultCode ResultCode,
    DriveResponse? Drive);

public enum CreateDriveResultCode
{
    Accepted,
    Replayed,
    IdempotencyConflict,
    Gone
}

public sealed record DriveResponse(
    Guid DriveId,
    string? DriveKey,
    string Name,
    string ContentTypeId,
    string? Remark,
    string Relation,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public enum RetryDriveCreationResultCode
{
    Accepted,
    NotFound,
    NotFailed
}

public sealed record UpdateDriveRemarkRequest(string? Remark);

public enum UpdateDriveRemarkResultCode
{
    Updated,
    NotFound
}

public enum DeleteDriveResultCode
{
    Deleted,
    NotFound
}
