using CineReel.Service.Events;
using CineReel.Service.Features.Bt;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Trailers;

/// <summary>
/// Warms the trailer cache when a torrent finishes downloading
/// (ADR 0054). Looks up the media item, derives the cache key
/// (imdb or local id), and stores the trailer from the publisher's
/// drive.
/// </summary>
public sealed class TrailerCacheWarmer : IDomainEventHandler<BtTorrentDownloadCompleted>
{
    private readonly ITrailerCache _cache;
    private readonly ILogger<TrailerCacheWarmer> _logger;

    public TrailerCacheWarmer(ITrailerCache cache, ILogger<TrailerCacheWarmer> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    public async Task HandleAsync(BtTorrentDownloadCompleted evt, CancellationToken cancellationToken)
    {
        try
        {
            var key = string.IsNullOrEmpty(evt.ImdbId) ? evt.LocalId : $"imdb-{evt.ImdbId}";
            if (string.IsNullOrEmpty(key)) return;
            await _cache.StoreAsync(key, evt.DriveKey, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "trailer cache warm failed for {DriveKey}", evt.DriveKey);
        }
    }
}

public sealed record BtTorrentDownloadCompleted(string DriveKey, string? ImdbId, string LocalId, DateTimeOffset ObservedAt) : CineReel.Service.Events.IDomainEvent;