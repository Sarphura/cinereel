using Cinereel.Features.Movie.Entity;
using Microsoft.EntityFrameworkCore;

namespace Cinereel.Infrastructure;

public class CinereelDbContext(DbContextOptions<CinereelDbContext> options) : DbContext(options)
{
    public DbSet<MovieEntity> Movies => Set<MovieEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CinereelDbContext).Assembly);
    }
}
