namespace Cinereel.Features.Drive;

internal interface IDriveCreationOperationRepository
{
    Task<DriveCreationOperationEntity?> FindByIdAsync(
        string idempotencyKey,
        CancellationToken cancellationToken);

    Task<DriveCreationOperationEntity?> FindByDriveIdAsync(
        Guid driveId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<DriveCreationOperationEntity>> FindAllAsync(
        CancellationToken cancellationToken);

    void Add(DriveCreationOperationEntity entity);

    void Remove(DriveCreationOperationEntity entity);
}
