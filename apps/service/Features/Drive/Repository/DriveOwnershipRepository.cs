using Cinereel.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Cinereel.Features.Drive;

internal sealed class DriveOwnershipRepository(CinereelDbContext dbContext) :
    IDriveOwnershipRepository
{
    public Task<DriveOwnershipEntity?> FindByIdAsync(
        Guid driveId,
        CancellationToken cancellationToken) =>
        dbContext.DriveOwnerships.SingleOrDefaultAsync(
            ownership => ownership.DriveId == driveId,
            cancellationToken);

    public async Task<IReadOnlyList<DriveOwnershipEntity>> FindAllAsync(
        CancellationToken cancellationToken) =>
        await dbContext.DriveOwnerships.ToListAsync(cancellationToken);

    public void Add(DriveOwnershipEntity entity) => dbContext.DriveOwnerships.Add(entity);

    public void Remove(DriveOwnershipEntity entity) => dbContext.DriveOwnerships.Remove(entity);
}
