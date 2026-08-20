namespace Cinereel.Features.Drive;

internal interface IDriveOwnershipRepository
{
    Task<DriveOwnershipEntity?> FindByIdAsync(
        Guid driveId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<DriveOwnershipEntity>> FindAllAsync(
        CancellationToken cancellationToken);

    void Add(DriveOwnershipEntity entity);

    void Remove(DriveOwnershipEntity entity);
}
