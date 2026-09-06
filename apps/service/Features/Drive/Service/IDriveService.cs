using Ardalis.Result;

namespace Cinereel.Features.Drive;

public interface IDriveService
{
    Task<Result<DriveResponse>> CreateAsync(
        IdempotencyKey idempotencyKey,
        CreateDriveRequest request,
        CancellationToken cancellationToken);

    Task<Result<DriveResponse>> GetAsync(
        DriveId driveId,
        CancellationToken cancellationToken);

    Task<Result<IReadOnlyList<DriveResponse>>> ListAsync(
        CancellationToken cancellationToken);

    Task<Result> RetryCreationAsync(
        DriveId driveId,
        CancellationToken cancellationToken);

    Task<Result> UpdateRemarkAsync(
        DriveId driveId,
        DriveRemark remark,
        CancellationToken cancellationToken);

    Task<Result> DeleteAsync(
        DriveId driveId,
        CancellationToken cancellationToken);
}
