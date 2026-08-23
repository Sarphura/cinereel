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
}
