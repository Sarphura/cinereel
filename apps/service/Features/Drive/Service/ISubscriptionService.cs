namespace Cinereel.Features.Drive;

public interface ISubscriptionService
{
    Task<CreateSubscriptionResult> CreateAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken);

    Task<RefreshSubscriptionResult> RefreshAsync(
        DriveId driveId,
        CancellationToken cancellationToken);

    Task<DeleteSubscriptionResultCode> DeleteAsync(
        DriveId driveId,
        CancellationToken cancellationToken);
}
