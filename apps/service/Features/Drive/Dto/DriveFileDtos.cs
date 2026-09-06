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

public sealed class DriveFileDownloadResponse : IDisposable
{
    internal DriveFileDownloadResponse(
        Stream content,
        string fileName,
        string contentType,
        long? contentLength)
    {
        Content = content;
        FileName = fileName;
        ContentType = contentType;
        ContentLength = contentLength;
    }

    public Stream Content { get; }

    public string FileName { get; }

    public string ContentType { get; }

    public long? ContentLength { get; }

    public void Dispose() => Content.Dispose();
}
