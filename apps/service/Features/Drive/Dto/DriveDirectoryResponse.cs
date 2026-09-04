namespace Cinereel.Features.Drive;

public sealed record DriveDirectoryResponse(
    string Path,
    long DriveVersion,
    IReadOnlyList<DriveDirectoryEntryResponse> Entries,
    string? NextCursor);
