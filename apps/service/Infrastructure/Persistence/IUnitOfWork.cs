namespace Cinereel.Infrastructure.Persistence;

internal interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);

    void ClearTrackedEntities();
}
