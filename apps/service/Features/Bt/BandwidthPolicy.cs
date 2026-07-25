namespace CineReel.Service.Features.Bt;

/// <summary>
/// Typed binding for <c>Bt:*</c> configuration (ADR 0009, 0041). Per
/// torrent caps are derived from the global cap divided by the
/// active-torrent count. <c>MinFreeSpaceBytes</c> is the disk-pressure
/// threshold consumed by <see cref="DiskPressureMonitor"/>.
/// </summary>
public sealed class BandwidthPolicy
{
    public long? MaxDownloadBytesPerSecond { get; set; }
    public long? MaxUploadBytesPerSecond { get; set; }
    public long MinFreeSpaceBytes { get; set; } = 5L * 1024 * 1024 * 1024;
    public int DiskPressureCheckIntervalSeconds { get; set; } = 30;
    public int RetainSeedingCount { get; set; } = 3;

    public (long? DownPerTorrent, long? UpPerTorrent) Split(int activeTorrents)
    {
        if (activeTorrents <= 0) return (MaxDownloadBytesPerSecond, MaxUploadBytesPerSecond);
        var down = MaxDownloadBytesPerSecond.HasValue ? MaxDownloadBytesPerSecond.Value / activeTorrents : (long?)null;
        var up = MaxUploadBytesPerSecond.HasValue ? MaxUploadBytesPerSecond.Value / activeTorrents : (long?)null;
        return (down, up);
    }
}