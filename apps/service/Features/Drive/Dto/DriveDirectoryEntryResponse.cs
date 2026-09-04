namespace Cinereel.Features.Drive;

public sealed record DriveDirectoryEntryResponse(
    string Path,
    string Name,
    string Type,
    long? Size);
