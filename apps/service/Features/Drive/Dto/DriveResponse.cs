namespace Cinereel.Features.Drive;

public sealed record DriveResponse(
    Guid DriveId,
    string DriveKey,
    string Name,
    string ContentTypeId,
    string? Remark,
    string Relation,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
