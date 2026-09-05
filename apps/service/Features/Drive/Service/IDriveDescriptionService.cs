namespace Cinereel.Features.Drive;

public interface IDriveDescriptionService
{
    Task<DriveDescriptionResponse?> GetAsync(DriveId driveId, CancellationToken cancellationToken);

    Task<UpdateDriveDescriptionResult> UpdateAsync(
        DriveId driveId,
        UpdateDriveDescriptionRequest request,
        CancellationToken cancellationToken);
}
