using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Features.Bt;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class DiskPressureMonitorTests
{
    [Fact]
    public async Task Below_threshold_triggers_seed_trim()
    {
        var probe = new StubProbe(available: 1024);
        var scheduler = new SpyBtScheduler();
        var monitor = new DiskPressureMonitor(
            probe,
            scheduler,
            new BandwidthPolicy { MinFreeSpaceBytes = 4096, RetainSeedingCount = 2, DiskPressureCheckIntervalSeconds = 30 },
            NullLogger<DiskPressureMonitor>.Instance,
            sleepOverride: _ => Task.Delay(50));

        using var cts = new CancellationTokenSource();
        await monitor.StartAsync(cts.Token);
        await WaitFor(() => scheduler.SeedTrimCalls > 0, TimeSpan.FromSeconds(5));
        cts.Cancel();
        await monitor.StopAsync(CancellationToken.None);

        Assert.True(scheduler.SeedTrimCalls >= 1);
    }

    [Fact]
    public async Task Above_threshold_is_noop()
    {
        var probe = new StubProbe(available: 1024 * 1024);
        var scheduler = new SpyBtScheduler();
        var monitor = new DiskPressureMonitor(
            probe,
            scheduler,
            new BandwidthPolicy { MinFreeSpaceBytes = 1024, RetainSeedingCount = 2 },
            NullLogger<DiskPressureMonitor>.Instance,
            sleepOverride: _ => Task.Delay(50));

        using var cts = new CancellationTokenSource();
        await monitor.StartAsync(cts.Token);
        await Task.Delay(150);
        cts.Cancel();
        await monitor.StopAsync(CancellationToken.None);

        Assert.Equal(0, scheduler.SeedTrimCalls);
    }

    private static async Task WaitFor(Func<bool> condition, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (condition()) return;
            await Task.Delay(20);
        }
    }
}

internal sealed class StubProbe : IDiskPressureProbe
{
    private readonly long _available;
    public StubProbe(long available) { _available = available; }
    public long GetAvailableFreeBytes() => _available;
}

internal sealed class SpyBtScheduler : IBtScheduler
{
    public int SeedTrimCalls { get; private set; }
    public Task ScanAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task StopAsync(SubscriptionId subscriptionId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task PauseSeedingAsync(MediaItemId mediaItemId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task ResumeAsync(MediaItemId mediaItemId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task SeedAllButRecentlyAccessedAsync(int retainCount, CancellationToken cancellationToken = default) { SeedTrimCalls++; return Task.CompletedTask; }
    public Task BanPeerAsync(string infohash, string ip, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public int ActiveTorrentCount => 0;
}