using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Bt;

public interface IDiskPressureProbe
{
    long GetAvailableFreeBytes();
}

/// <summary>
/// Default probe backed by <c>DriveInfo.AvailableFreeSpace</c> for
/// the configured library root. Tests inject a fake.
/// </summary>
public sealed class LibraryRootDiskPressureProbe : IDiskPressureProbe
{
    private readonly string _libraryRoot;
    public LibraryRootDiskPressureProbe(string libraryRoot) { _libraryRoot = libraryRoot; }
    public long GetAvailableFreeBytes()
    {
        var path = string.IsNullOrEmpty(_libraryRoot) ? Directory.GetCurrentDirectory() : _libraryRoot;
        var root = Path.GetPathRoot(Path.GetFullPath(path));
        if (string.IsNullOrEmpty(root)) return long.MaxValue;
        try
        {
            return new DriveInfo(root).AvailableFreeSpace;
        }
        catch
        {
            return long.MaxValue;
        }
    }
}

/// <summary>
/// Watches the library drive's free space. When it dips below
/// <c>BandwidthPolicy.MinFreeSpaceBytes</c>, the monitor asks the
/// scheduler to seed only the most recently accessed torrents.
/// </summary>
public sealed class DiskPressureMonitor : BackgroundService
{
    private readonly IDiskPressureProbe _probe;
    private readonly IBtScheduler _scheduler;
    private readonly BandwidthPolicy _policy;
    private readonly ILogger<DiskPressureMonitor> _logger;
    private readonly Func<CancellationToken, Task>? _sleepOverride;

    public DiskPressureMonitor(
        IDiskPressureProbe probe,
        IBtScheduler scheduler,
        BandwidthPolicy policy,
        ILogger<DiskPressureMonitor> logger,
        Func<CancellationToken, Task>? sleepOverride = null)
    {
        _probe = probe;
        _scheduler = scheduler;
        _policy = policy;
        _logger = logger;
        _sleepOverride = sleepOverride;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(_policy.DiskPressureCheckIntervalSeconds);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var available = _probe.GetAvailableFreeBytes();
                if (available < _policy.MinFreeSpaceBytes)
                {
                    _logger.LogWarning("[disk-pressure] {Bytes} bytes free below threshold {Min}", available, _policy.MinFreeSpaceBytes);
                    await _scheduler.SeedAllButRecentlyAccessedAsync(_policy.RetainSeedingCount, stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[disk-pressure] check failed");
            }

            if (_sleepOverride is not null) await _sleepOverride(stoppingToken);
            else await Task.Delay(interval, stoppingToken);
        }
    }
}