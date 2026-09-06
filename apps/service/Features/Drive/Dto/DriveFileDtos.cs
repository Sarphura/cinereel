namespace Cinereel.Features.Drive;

public sealed record DriveDirectoryResponse(
    string Path,
    long DriveVersion,
    IReadOnlyList<DriveDirectoryEntryResponse> Entries,
    string? NextCursor);

public sealed record DriveDirectoryEntryResponse(
    string Path,
    string Name,
    string Type,
    long? Size);
