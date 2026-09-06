using Ardalis.Result;

namespace Cinereel.Features.Drive;

public interface IDriveDescriptionService
{
    Task<Result<DriveDescriptionResponse>> GetAsync(DriveId driveId, CancellationToken cancellationToken);

    Task<Result<DriveDescriptionResponse>> UpdateAsync(
        DriveId driveId,
        UpdateDriveDescriptionRequest request,
        CancellationToken cancellationToken);
}
