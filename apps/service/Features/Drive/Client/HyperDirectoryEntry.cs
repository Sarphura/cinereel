namespace Cinereel.Features.Drive;

internal sealed record HyperDirectoryEntry(
    string Path,
    string Name,
    string Type,
    long? Size);
