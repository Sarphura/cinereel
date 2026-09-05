namespace Cinereel.Features.Drive;

internal interface IDriveManifestService
{
    Task<ReadDriveManifestResult> ReadAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken);

    Task<WriteDriveManifestResult> WriteAsync(
        DriveKey driveKey,
        DriveManifest manifest,
        string? expectedETag,
        CancellationToken cancellationToken);
}
