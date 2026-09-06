namespace Cinereel.Features.Drive;

public sealed record CreateDriveRequest(
    string? Name,
    string? ContentTypeId);

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

public sealed record UpdateDriveRemarkRequest(string? Remark);
