namespace Cinereel.Features.Drive;

internal interface IDriveRepository
{
    Task<DriveEntity?> FindByIdAsync(
        Guid driveId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<DriveEntity>> FindAllAsync(
        CancellationToken cancellationToken);

    void Add(DriveEntity entity);

    void Remove(DriveEntity entity);
}
