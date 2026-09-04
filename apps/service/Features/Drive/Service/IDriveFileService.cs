namespace Cinereel.Features.Drive;

public interface IDriveFileService
{
    const int DefaultDirectoryPageSize = 100;
    const int MaxDirectoryPageSize = 500;
    const long MaxFileSize = 500L * 1024 * 1024;

    Task<ListDriveDirectoryResult> ListDirectoryAsync(
        DriveId driveId,
        DriveDirectoryPath path,
        DriveDirectoryCursor? cursor,
        int limit,
        CancellationToken cancellationToken);

    Task<AddDriveFileResultCode> AddFileAsync(
        DriveId driveId,
        DriveFilePath path,
        Stream content,
        CancellationToken cancellationToken);

    Task<DeleteDriveFileResultCode> DeleteFileAsync(
        DriveId driveId,
        DriveFilePath path,
        CancellationToken cancellationToken);

    Task<DeleteDriveDirectoryResultCode> DeleteDirectoryAsync(
        DriveId driveId,
        DriveDirectoryPath path,
        CancellationToken cancellationToken);
}
