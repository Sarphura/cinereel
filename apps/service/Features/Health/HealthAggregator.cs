using System.Diagnostics;

namespace CineReel.Service.Features.Health;

/// <summary>
/// Runs all probes. Required probes run serially so a probe
/// side-effect (e.g. circuit-breaker state change) isn't observed out of
/// order; optional probes run in parallel to keep the endpoint latency
/// bounded when one of them is slow. The endpoint returns 200 when all
/// required probes are healthy, 503 when any required probe is unhealthy.
/// </summary>
public sealed class HealthAggregator
{
    private readonly IReadOnlyList<IHealthProbe> _probes;

    public HealthAggregator(IEnumerable<IHealthProbe> probes)
    {
        _probes = probes.ToArray();
    }

    public async Task<HealthReport> RunAsync(CancellationToken cancellationToken)
    {
        var required = _probes.Where(p => p.Required).ToArray();
        var optional = _probes.Where(p => !p.Required).ToArray();

        var requiredResults = new List<HealthCheckResult>(required.Length);
        foreach (var probe in required)
        {
            requiredResults.Add(await RunProbeAsync(probe, cancellationToken));
        }

        var optionalResults = await Task.WhenAll(
            optional.Select(p => RunProbeAsync(p, cancellationToken)));

        var allResults = requiredResults.Concat(optionalResults).ToArray();
        var anyRequiredUnhealthy = requiredResults.Any(r => r.Status == HealthCheckStatus.Unhealthy);
        var anyOptionalFailing = optionalResults.Any(r => r.Status is HealthCheckStatus.Unhealthy or HealthCheckStatus.Degraded);

        var status = anyRequiredUnhealthy
            ? HealthAggregateStatus.Unhealthy
            : anyOptionalFailing
                ? HealthAggregateStatus.Degraded
                : HealthAggregateStatus.Healthy;

        return new HealthReport(
            status,
            typeof(HealthAggregator).Assembly.GetName().Version?.ToString() ?? "0.0.0",
            allResults.ToDictionary(r => r.Name, r => r));
    }

    private static async Task<HealthCheckResult> RunProbeAsync(IHealthProbe probe, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            return await probe.CheckAsync(ct);
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy(probe.Name, sw.ElapsedMilliseconds, ex.GetType().Name + ": " + ex.Message);
        }
    }
}

public enum HealthAggregateStatus
{
    Healthy,
    Degraded,
    Unhealthy,
}

public sealed record HealthReport(
    HealthAggregateStatus Status,
    string Version,
    IReadOnlyDictionary<string, HealthCheckResult> Checks);
