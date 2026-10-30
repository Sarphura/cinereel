using Ardalis.Specification.EntityFrameworkCore;
using Cinereel.Features.Movie.Entity;
using Cinereel.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Cinereel.Features.Movie;

public sealed class MovieRepository(CinereelDbContext db) : RepositoryBase<MovieEntity>(db), IMovieRepository
{
    public Task<bool> TmdbIdExistsAsync(int tmdbId, CancellationToken cancellationToken = default)
        => DbContext.Set<MovieEntity>().AnyAsync(movie => movie.TmdbId == tmdbId, cancellationToken);
}
