namespace Cinereel.Features.Drive;

internal sealed record HyperDirectoryPage(
    string Path,
    long DriveVersion,
    IReadOnlyList<HyperDirectoryEntry> Entries,
    string? NextCursor);

internal sealed record HyperDirectoryEntry(
    string Path,
    string Name,
    string Type,
    long? Size);

internal enum HyperAddFileResultCode
{
    Created,
    AlreadyExists,
    DriveNotWritable,
    FileTooLarge
}

internal enum HyperDeleteFileResultCode
{
    Deleted,
    NotFound,
    DriveNotWritable
}

internal enum HyperDeleteDirectoryResultCode
{
    Deleted,
    DriveNotWritable
}

internal sealed class HyperClientException : Exception
{
    internal HyperClientException(string message)
        : base(message)
    {
    }

    internal HyperClientException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
