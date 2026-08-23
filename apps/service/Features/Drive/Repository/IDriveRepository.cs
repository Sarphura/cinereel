namespace Cinereel.Features.Drive;

internal interface IDriveRepository
{
    Task<DriveEntity?> FindByIdAsync(
        Guid driveId,
        CancellationToken cancellationToken);

    Task<DriveEntity?> FindByIdempotencyKeyAsync(
        string idempotencyKey,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<DriveEntity>> FindAllAsync(
        CancellationToken cancellationToken);

    Task<IReadOnlyList<DriveEntity>> FindAllByStatusAsync(
        DriveStatus status,
        CancellationToken cancellationToken);

    void Add(DriveEntity entity);

    void Remove(DriveEntity entity);
}
