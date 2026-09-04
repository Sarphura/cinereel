namespace Cinereel.Features.Drive;

internal sealed record HyperDirectoryPage(
    string Path,
    long DriveVersion,
    IReadOnlyList<HyperDirectoryEntry> Entries,
    string? NextCursor);
