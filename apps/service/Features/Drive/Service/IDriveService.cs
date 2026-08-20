namespace Cinereel.Features.Drive;

public interface IDriveService
{
    Task<CreateDriveResult> CreateAsync(
        IdempotencyKey idempotencyKey,
        CreateDriveRequest request,
        CancellationToken cancellationToken);

    Task<DriveResponse?> GetAsync(
        DriveId driveId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<DriveResponse>> ListAsync(
        CancellationToken cancellationToken);
}
