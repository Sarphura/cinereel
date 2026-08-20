namespace Cinereel.Features.Drive;

public sealed record CreateDriveRequest(
    string? Name,
    string? ContentTypeId);
