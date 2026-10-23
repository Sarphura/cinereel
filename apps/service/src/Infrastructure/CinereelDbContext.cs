using Cinereel.Features.Movie.Entity;
using Microsoft.EntityFrameworkCore;

namespace Cinereel.Infrastructure;

public class CinereelDbContext(DbContextOptions<CinereelDbContext> options) : DbContext(options)
{
    public DbSet<MovieEntity> Movies => Set<MovieEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MovieEntity>(entity =>
        {
            entity.ToTable("Movies");
            entity.HasIndex(movie => movie.TmdbId).IsUnique();

            entity.OwnsMany(movie => movie.Genres, builder => builder.ToJson());
            entity.OwnsMany(movie => movie.ProductionCompanies, builder => builder.ToJson());
            entity.OwnsMany(movie => movie.ProductionCountries, builder => builder.ToJson());
            entity.OwnsMany(movie => movie.SpokenLanguages, builder => builder.ToJson());
            entity.OwnsOne(movie => movie.BelongsToCollection, builder => builder.ToJson());
            entity.PrimitiveCollection(movie => movie.OriginCountry);
        });
    }
}
