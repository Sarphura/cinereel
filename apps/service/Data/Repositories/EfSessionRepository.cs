using CineReel.Service.Data.Entities;
using CineReel.Service.Features.Accounts;
using Microsoft.EntityFrameworkCore;

namespace CineReel.Service.Data.Repositories;

public sealed class EfSessionRepository(CinereelDbContext db) : ISessionRepository
{
    public Task<SessionEntity?> FindByTokenAsync(string token, CancellationToken cancellationToken = default) => db.Sessions.Include(item => item.Account).SingleOrDefaultAsync(item => item.Token == token, cancellationToken);
    public async Task AddAsync(SessionEntity session, CancellationToken cancellationToken = default) { db.Sessions.Add(session); await db.SaveChangesAsync(cancellationToken); }
    public async Task SaveAsync(SessionEntity session, CancellationToken cancellationToken = default) { db.Sessions.Update(session); await db.SaveChangesAsync(cancellationToken); }
    public async Task RemoveAsync(string token, CancellationToken cancellationToken = default) { var session = await db.Sessions.FindAsync([token], cancellationToken); if (session is not null) { db.Sessions.Remove(session); await db.SaveChangesAsync(cancellationToken); } }
    public Task<int> RemoveExpiredAsync(DateTimeOffset now, CancellationToken cancellationToken = default) => db.Sessions.Where(item => item.ExpiresAt < now).ExecuteDeleteAsync(cancellationToken);
}
