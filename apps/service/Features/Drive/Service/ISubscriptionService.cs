using Ardalis.Result;

namespace Cinereel.Features.Drive;

public interface ISubscriptionService
{
    Task<Result<DriveDescriptionResponse>> CreateAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken);

    Task<Result<DriveDescriptionResponse>> RefreshAsync(
        DriveId driveId,
        CancellationToken cancellationToken);

    Task<Result> DeleteAsync(
        DriveId driveId,
        CancellationToken cancellationToken);
}
