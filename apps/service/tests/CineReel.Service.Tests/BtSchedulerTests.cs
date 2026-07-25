using System.Collections.Concurrent;
using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Bt;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class BtSchedulerTests
{
    private const string DriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public async Task Scan_starts_torrents_via_engine()
    {
        var engine = new StubBtEngine();
        var torrents = new InMemoryTorrentFileRepository();
        await torrents.UpsertAsync(MakeTorrent(subscriptionId: 1, mediaItemId: 2, driveKey: DriveKey, torrentPath: "/m/movie.torrent"));
        var scheduler = NewScheduler(engine, torrents);

        await scheduler.ScanAsync(new SubscriptionId(1));

        Assert.Single(engine.StartCalls);
        Assert.Equal(DriveKey, engine.StartCalls[0].DriveKey);
    }

    [Fact]
    public async Task Stop_calls_engine_for_each_torrent()
    {
        var engine = new StubBtEngine();
        var torrents = new InMemoryTorrentFileRepository();
        await torrents.UpsertAsync(MakeTorrent(subscriptionId: 1, mediaItemId: 2, driveKey: DriveKey, torrentPath: "/a/movie.torrent"));
        await torrents.UpsertAsync(MakeTorrent(subscriptionId: 1, mediaItemId: 3, driveKey: DriveKey, torrentPath: "/b/movie.torrent"));
        var scheduler = NewScheduler(engine, torrents);

        await scheduler.StopAsync(new SubscriptionId(1));

        Assert.Equal(2, engine.StopCalls.Count);
    }

    [Fact]
    public async Task PauseSeeding_and_Resume_route_to_engine()
    {
        var engine = new StubBtEngine();
        var torrents = new InMemoryTorrentFileRepository();
        var torrent = MakeTorrent(subscriptionId: 1, mediaItemId: 2, driveKey: DriveKey, torrentPath: "/m/movie.torrent");
        await torrents.UpsertAsync(torrent);
        var scheduler = NewScheduler(engine, torrents);

        await scheduler.PauseSeedingAsync(new MediaItemId(torrent.MediaItemId));
        await scheduler.ResumeAsync(new MediaItemId(torrent.MediaItemId));

        Assert.Single(engine.PauseCalls);
        Assert.Single(engine.ResumeCalls);
    }

    [Fact]
    public async Task SubscriptionDeleted_handler_stops_torrents()
    {
        var engine = new StubBtEngine();
        var torrents = new InMemoryTorrentFileRepository();
        await torrents.UpsertAsync(MakeTorrent(subscriptionId: 1, mediaItemId: 2, driveKey: DriveKey, torrentPath: "/m/movie.torrent"));
        var scheduler = NewScheduler(engine, torrents);
        var evt = new CineReel.Service.Features.Subscription.Events.SubscriptionDeleted(new SubscriptionId(1), new DriveKey(DriveKey), DateTimeOffset.UtcNow);

        await scheduler.HandleAsync(evt, CancellationToken.None);

        Assert.Single(engine.StopCalls);
    }

    private static BtScheduler NewScheduler(IBtEngine engine, ITorrentFileRepository torrents)
        => new(engine, torrents, new CinereelBtOptions(), NullLogger<BtScheduler>.Instance);

    private static TorrentFileEntity MakeTorrent(int subscriptionId, int mediaItemId, string driveKey, string torrentPath)
    {
        var item = new MediaItemEntity
        {
            Id = mediaItemId,
            SubscriptionId = subscriptionId,
            DriveKey = driveKey,
            DrivePath = "/m",
            Title = "Sample",
            DescriptorHash = "h",
            TorrentPath = torrentPath,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            LastScannedAt = DateTimeOffset.UtcNow,
        };
        return new TorrentFileEntity
        {
            MediaItemId = item.Id,
            MediaItem = item,
            Infohash = "ih",
            TotalBytes = 1024,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
    }
}

internal sealed class StubBtEngine : IBtEngine
{
    private readonly ConcurrentDictionary<string, BtState> _states = new();
    public List<(string DriveKey, string TorrentPath, BtEngineOptions Options)> StartCalls { get; } = new();
    public List<string> StopCalls { get; } = new();
    public List<string> PauseCalls { get; } = new();
    public List<string> ResumeCalls { get; } = new();
    public int ActiveTorrentCount => _states.Count(c => c.Value is BtState.Downloading or BtState.Seeding);

    public Task StartAsync(string driveKey, string torrentPath, BtEngineOptions options, CancellationToken cancellationToken = default)
    {
        StartCalls.Add((driveKey, torrentPath, options));
        _states[driveKey] = BtState.Downloading;
        return Task.CompletedTask;
    }
    public Task StopAsync(string driveKey, CancellationToken cancellationToken = default) { StopCalls.Add(driveKey); _states.TryRemove(driveKey, out _); return Task.CompletedTask; }
    public Task PauseAsync(string driveKey, CancellationToken cancellationToken = default) { PauseCalls.Add(driveKey); _states[driveKey] = BtState.Stopped; return Task.CompletedTask; }
    public Task ResumeAsync(string driveKey, CancellationToken cancellationToken = default) { ResumeCalls.Add(driveKey); _states[driveKey] = BtState.Seeding; return Task.CompletedTask; }
    public Task<BtState> GetStateAsync(string driveKey, CancellationToken cancellationToken = default) =>
        Task.FromResult(_states.GetValueOrDefault(driveKey, BtState.Stopped));
}