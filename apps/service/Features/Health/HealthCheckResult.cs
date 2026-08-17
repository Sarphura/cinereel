namespace CineReel.Service.Features.Health;

/// <summary>
/// A single probe in the health aggregator. The response shape
/// enumerates each probe individually and lets the aggregator decide whether
/// the overall status is `healthy` or `degraded` based on whether the probe
/// is `required`.
/// </summary>
public sealed record HealthCheckResult(
    string Name,
    HealthCheckStatus Status,
    long LatencyMs,
    string? Detail)
{
    public static HealthCheckResult Healthy(string name, long ms, string? detail = null)
        => new(name, HealthCheckStatus.Healthy, ms, detail);

    public static HealthCheckResult Degraded(string name, long ms, string? detail = null)
        => new(name, HealthCheckStatus.Degraded, ms, detail);

    public static HealthCheckResult Unhealthy(string name, long ms, string? detail = null)
        => new(name, HealthCheckStatus.Unhealthy, ms, detail);
}

public enum HealthCheckStatus
{
    Healthy,
    Degraded,
    Unhealthy,
}
