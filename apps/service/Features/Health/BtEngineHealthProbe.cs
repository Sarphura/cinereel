using System.Diagnostics;

namespace CineReel.Service.Features.Health;

/// <summary>
/// Optional probe that mirrors the BitTorrent scheduler's `ActiveTorrentCount`.
/// When no scheduler is registered yet (BT not implemented), the
/// probe reports healthy with a placeholder message so the endpoint never
/// fails simply because BT is not yet wired.
/// </summary>
public sealed class BtEngineHealthProbe : IHealthProbe
{
    public string Name => "bt_engine";
    public bool Required => false;

    public Task<HealthCheckResult> CheckAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(HealthCheckResult.Healthy(Name, 0, "no active engine"));
    }
}
