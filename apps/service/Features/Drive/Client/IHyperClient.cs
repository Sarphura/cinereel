namespace Cinereel.Features.Drive;

internal interface IHyperClient
{
    Task<DriveKey> EnsureDriveAsync(
        DriveId driveId,
        DriveName name,
        CancellationToken cancellationToken);

    Task DeleteAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken);

    Task<HyperDirectoryPage> ListDirectoryAsync(
        DriveKey driveKey,
        DriveDirectoryPath path,
        string? cursor,
        int limit,
        CancellationToken cancellationToken);

    Task<HyperAddFileResultCode> AddFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        Stream content,
        CancellationToken cancellationToken);

    Task<HyperReadFileResult> ReadFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken);

    Task<HyperDeleteFileResultCode> DeleteFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken);

    Task<HyperDeleteDirectoryResultCode> DeleteDirectoryAsync(
        DriveKey driveKey,
        DriveDirectoryPath path,
        CancellationToken cancellationToken);

    Task<HyperReadProtocolFileResult> ReadProtocolFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken);

    Task<HyperWriteProtocolFileResult> WriteProtocolFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        ReadOnlyMemory<byte> content,
        string? expectedETag,
        CancellationToken cancellationToken);
}
