using Cinereel.Features.Drive;
using Microsoft.EntityFrameworkCore;

namespace Cinereel.Infrastructure.Persistence;

internal sealed class CinereelDbContext(
    DbContextOptions<CinereelDbContext> options) : DbContext(options)
{
    internal DbSet<DriveEntity> Drives => Set<DriveEntity>();

    internal DbSet<DriveCreationOperationEntity> DriveCreationOperations =>
        Set<DriveCreationOperationEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CinereelDbContext).Assembly);
    }
}
