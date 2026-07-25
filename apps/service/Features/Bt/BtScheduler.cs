using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Bt;

public interface IBtScheduler
{
    Task ScanAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default);
    Task StopAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default);
    Task PauseSeedingAsync(MediaItemId mediaItemId, CancellationToken cancellationToken = default);
    Task ResumeAsync(MediaItemId mediaItemId, CancellationToken cancellationToken = default);
    Task SeedAllButRecentlyAccessedAsync(int retainCount, CancellationToken cancellationToken = default);
    Task BanPeerAsync(string infohash, string ip, CancellationToken cancellationToken = default);
    int ActiveTorrentCount { get; }
}

/// <summary>
/// BT scheduler (ticket 25). Wires <c>MediaItemAdded</c> into
/// <c>IBtEngine.StartAsync</c> for each torrent_file row, and
/// <c>SubscriptionDeleted</c> into <c>IBtScheduler.StopAsync</c>.
/// Per-Media-Item pause/resume goes through <c>MediaItemId</c> via
/// the torrent file's drive path.
/// </summary>
public sealed class BtScheduler : IBtScheduler,
    IDomainEventHandler<Features.Metadata.Events.MediaItemAdded>,
    IDomainEventHandler<Features.Subscription.Events.SubscriptionDeleted>
{
    private readonly IBtEngine _engine;
    private readonly ITorrentFileRepository _torrents;
    private readonly CinereelBtOptions _options;
    private readonly ILogger<BtScheduler> _logger;
    private readonly TimeProvider _clock;

    public BtScheduler(
        IBtEngine engine,
        ITorrentFileRepository torrents,
        CinereelBtOptions options,
        ILogger<BtScheduler> logger,
        TimeProvider? clock = null)
    {
        _engine = engine;
        _torrents = torrents;
        _options = options;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    public int ActiveTorrentCount => _engine.ActiveTorrentCount;

    public Task HandleAsync(Features.Metadata.Events.MediaItemAdded evt, CancellationToken cancellationToken)
        => ScanSubscriptionAsync(evt.SubscriptionId, cancellationToken);

    public Task HandleAsync(Features.Subscription.Events.SubscriptionDeleted evt, CancellationToken cancellationToken)
        => StopAsync(evt.Id, cancellationToken);

    public async Task ScanAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default)
        => await ScanSubscriptionAsync(subscriptionId, cancellationToken);

    public async Task ScanSubscriptionAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken)
    {
        var rows = await _torrents.ListBySubscriptionAsync(subscriptionId, cancellationToken);
        foreach (var row in rows)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var driveKey = row.MediaItem?.DriveKey ?? string.Empty;
            var state = await _engine.GetStateAsync(driveKey, cancellationToken);
            if (state != BtState.Stopped) continue;
            try
            {
                await _engine.StartAsync(driveKey, row.MediaItem?.TorrentPath ?? string.Empty, BuildOptions(), cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "BT start failed for {DriveKey}", driveKey);
            }
        }
    }

    public async Task StopAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default)
    {
        var rows = await _torrents.ListBySubscriptionAsync(subscriptionId, cancellationToken);
        foreach (var row in rows)
        {
            try { await _engine.StopAsync(row.MediaItem?.DriveKey ?? string.Empty, cancellationToken); }
            catch (Exception ex) { _logger.LogWarning(ex, "BT stop failed for {DriveKey}", row.MediaItem?.DriveKey); }
        }
    }

    public async Task PauseSeedingAsync(MediaItemId mediaItemId, CancellationToken cancellationToken = default)
    {
        var row = await _torrents.FindByMediaItemIdAsync(mediaItemId, cancellationToken);
        if (row?.MediaItem is null) return;
        await _engine.PauseAsync(row.MediaItem.DriveKey, cancellationToken);
    }

    public async Task ResumeAsync(MediaItemId mediaItemId, CancellationToken cancellationToken = default)
    {
        var row = await _torrents.FindByMediaItemIdAsync(mediaItemId, cancellationToken);
        if (row?.MediaItem is null) return;
        await _engine.ResumeAsync(row.MediaItem.DriveKey, cancellationToken);
    }

    private BtEngineOptions BuildOptions() =>
        new(
            _options.ListenPort,
            _options.DhtPort,
            _options.MaxDownloadBytesPerSecond,
            _options.MaxUploadBytesPerSecond);

    public async Task SeedAllButRecentlyAccessedAsync(int retainCount, CancellationToken cancellationToken = default)
    {
        var all = await _torrents.ListAllAsync(cancellationToken);
        var sorted = all.OrderByDescending(t => t.MediaItem?.UpdatedAt ?? DateTimeOffset.MinValue).ToList();
        foreach (var row in sorted.Skip(retainCount))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (row.MediaItem is null) continue;
            try { await _engine.StopAsync(row.MediaItem.DriveKey, cancellationToken); }
            catch (Exception ex) { _logger.LogWarning(ex, "BT seed-trim stop failed for {DriveKey}", row.MediaItem.DriveKey); }
        }
    }

    public Task BanPeerAsync(string infohash, string ip, CancellationToken cancellationToken = default)
        => _engine.BanPeerAsync(infohash, ip, cancellationToken);
}

public sealed class CinereelBtOptions
{
    public int ListenPort { get; set; } = 6881;
    public int DhtPort { get; set; } = 6881;
    public long? MaxDownloadBytesPerSecond { get; set; }
    public long? MaxUploadBytesPerSecond { get; set; }
}