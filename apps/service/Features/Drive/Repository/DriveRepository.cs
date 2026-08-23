using Cinereel.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Cinereel.Features.Drive;

internal sealed class DriveRepository(CinereelDbContext dbContext) : IDriveRepository
{
    public Task<DriveEntity?> FindByIdAsync(
        Guid driveId,
        CancellationToken cancellationToken) =>
        dbContext.Drives.SingleOrDefaultAsync(
            drive => drive.Id == driveId,
            cancellationToken);

    public Task<DriveEntity?> FindByIdempotencyKeyAsync(
        string idempotencyKey,
        CancellationToken cancellationToken) =>
        dbContext.Drives.SingleOrDefaultAsync(
            drive => drive.IdempotencyKey == idempotencyKey,
            cancellationToken);

    public async Task<IReadOnlyList<DriveEntity>> FindAllAsync(
        CancellationToken cancellationToken) =>
        await dbContext.Drives.ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<DriveEntity>> FindAllByStatusAsync(
        DriveStatus status,
        CancellationToken cancellationToken) =>
        await dbContext.Drives
            .Where(drive => drive.Status == status)
            .ToListAsync(cancellationToken);

    public void Add(DriveEntity entity) => dbContext.Drives.Add(entity);

    public void Remove(DriveEntity entity) => dbContext.Drives.Remove(entity);
}
