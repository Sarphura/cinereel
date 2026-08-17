using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CineReel.Service.Features.Metadata;

/// <summary>
/// Coordinates the IMDb fallback chain.
/// If the parsed NFO already carries an IMDb ID, it is returned as
/// <see cref="IDKind.Direct"/>. Otherwise Tier 1 (TMDB) is attempted
/// only if an API key is configured. On Tier 1 success the resolved
/// ID is cached; on Tier 1 miss the resolver always falls through to
/// Tier 2 (synthetic) — failed lookups are not retried within a scan
/// pass to avoid API rate-limit loops.
/// </summary>
public sealed class IMDbResolver : IIMDBResolver
{
    private readonly TmdbClient _tmdb;
    private readonly ILogger<IMDbResolver> _logger;
    private readonly TimeProvider _clock;

    public IMDbResolver(TmdbClient tmdb, ILogger<IMDbResolver> logger, TimeProvider? clock = null)
    {
        _tmdb = tmdb;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<ResolvedID> ResolveAsync(ParsedNfo parsedNfo, string driveKey, string drivePath, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(parsedNfo.ImdbId))
        {
            return new ResolvedID(parsedNfo.ImdbId, IDKind.Direct);
        }

        if (_tmdb.Enabled)
        {
            try
            {
                var tmdbId = await _tmdb.SearchMovieAsync(parsedNfo.Title, parsedNfo.Year, cancellationToken).ConfigureAwait(false);
                if (!string.IsNullOrWhiteSpace(tmdbId))
                {
                    _logger.LogInformation(
                        "IMDb resolve via TMDB: title={Title} year={Year} -> {Id}",
                        parsedNfo.Title,
                        parsedNfo.Year,
                        tmdbId);
                    return new ResolvedID(tmdbId, IDKind.Tmdb);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "TMDB lookup failed for {Title} ({Year}); falling through to synthetic", parsedNfo.Title, parsedNfo.Year);
            }
        }

        return new ResolvedID(SyntheticIdGenerator.Generate(driveKey, drivePath), IDKind.Synthetic);
    }
}
