using Cinereel.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Cinereel.Features.Drive;

internal sealed class DriveCreationOperationRepository(CinereelDbContext dbContext) :
    IDriveCreationOperationRepository
{
    public Task<DriveCreationOperationEntity?> FindByIdAsync(
        string idempotencyKey,
        CancellationToken cancellationToken) =>
        dbContext.DriveCreationOperations.SingleOrDefaultAsync(
            operation => operation.IdempotencyKey == idempotencyKey,
            cancellationToken);

    public Task<DriveCreationOperationEntity?> FindByDriveIdAsync(
        Guid driveId,
        CancellationToken cancellationToken) =>
        dbContext.DriveCreationOperations.SingleOrDefaultAsync(
            operation => operation.DriveId == driveId,
            cancellationToken);

    public async Task<IReadOnlyList<DriveCreationOperationEntity>> FindAllAsync(
        CancellationToken cancellationToken) =>
        await dbContext.DriveCreationOperations.ToListAsync(cancellationToken);

    public void Add(DriveCreationOperationEntity entity) =>
        dbContext.DriveCreationOperations.Add(entity);

    public void Remove(DriveCreationOperationEntity entity) =>
        dbContext.DriveCreationOperations.Remove(entity);
}
