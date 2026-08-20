namespace Cinereel.Infrastructure.Persistence;

internal sealed class UnitOfWork(CinereelDbContext dbContext) : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);

    public void ClearTrackedEntities() => dbContext.ChangeTracker.Clear();
}
