using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Trailers;

/// <summary>
/// Periodically evicts the trailer cache until total size is below
/// the configured floor (ADR 0054). Eviction order is LRU by
/// last-access time.
/// </summary>
public sealed class TrailerCacheMaintainer : BackgroundService
{
    private readonly ITrailerCache _cache;
    private readonly TrailerCacheOptions _options;
    private readonly ILogger<TrailerCacheMaintainer> _logger;

    public TrailerCacheMaintainer(ITrailerCache cache, TrailerCacheOptions options, ILogger<TrailerCacheMaintainer> logger)
    {
        _cache = cache;
        _options = options;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(_options.MaintainIntervalSeconds);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _cache.EvictUntilBelowFloorAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "trailer cache maintenance failed");
            }
            try { await Task.Delay(interval, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }
}