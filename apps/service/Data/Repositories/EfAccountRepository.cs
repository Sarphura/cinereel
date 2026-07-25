using CineReel.Service.Data.Entities;
using CineReel.Service.Features.Accounts;
using Microsoft.EntityFrameworkCore;

namespace CineReel.Service.Data.Repositories;

public sealed class EfAccountRepository(CinereelDbContext db) : IAccountRepository
{
    public Task<AccountEntity?> FindByIdAsync(int id, CancellationToken cancellationToken = default) => db.Accounts.FindAsync([id], cancellationToken).AsTask();
    public Task<AccountEntity?> FindByUsernameAsync(string username, CancellationToken cancellationToken = default) => db.Accounts.SingleOrDefaultAsync(item => item.Username == username, cancellationToken);
    public async Task<IReadOnlyList<AccountEntity>> ListAsync(CancellationToken cancellationToken = default) => await db.Accounts.AsNoTracking().ToListAsync(cancellationToken);
    public async Task<AccountEntity> AddAsync(AccountEntity account, CancellationToken cancellationToken = default) { db.Accounts.Add(account); await db.SaveChangesAsync(cancellationToken); return account; }
    public async Task SaveAsync(AccountEntity account, CancellationToken cancellationToken = default) { db.Accounts.Update(account); await db.SaveChangesAsync(cancellationToken); }
}
