using System.Diagnostics;

namespace CineReel.Service.Features.Health;

/// <summary>
/// Optional probe that confirms the Jellyfin library path is mounted and
/// has enough free space to accept media. Implementation lands with BT —
/// today it always reports healthy with a stub message.
/// </summary>
public sealed class DiskSpaceProbe : IHealthProbe
{
    public string Name => "disk_space";
    public bool Required => false;

    private readonly Func<string?> _libraryRootAccessor;

    public DiskSpaceProbe() : this(() => null) { }

    public DiskSpaceProbe(Func<string?> libraryRootAccessor)
    {
        _libraryRootAccessor = libraryRootAccessor;
    }

    public Task<HealthCheckResult> CheckAsync(CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        var root = _libraryRootAccessor();
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
        {
            sw.Stop();
            return Task.FromResult(HealthCheckResult.Healthy(Name, sw.ElapsedMilliseconds, "no library root configured"));
        }

        try
        {
            var drive = new DriveInfo(root);
            sw.Stop();
            var free = drive.AvailableFreeSpace;
            return Task.FromResult(HealthCheckResult.Healthy(Name, sw.ElapsedMilliseconds, free + " bytes free"));
        }
        catch (Exception ex)
        {
            sw.Stop();
            return Task.FromResult(HealthCheckResult.Degraded(Name, sw.ElapsedMilliseconds, ex.GetType().Name));
        }
    }
}
