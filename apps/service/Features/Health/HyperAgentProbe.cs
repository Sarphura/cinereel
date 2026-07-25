using CineReel.Service.Infrastructure.HyperAgent;

namespace CineReel.Service.Features.Health;

/// <summary>
/// Hyper Agent probe that resolves `IHyperAgentReadClient` lazily so the
/// App Server can boot with the probe registered even when the Hyper
/// Agent client itself is not (e.g. minimum smoke test, dev mode without
/// a sidecar). When the client is missing the probe reports `degraded`
/// rather than throwing at boot.
/// </summary>
public sealed class HyperAgentProbe : IHealthProbe
{
    public string Name => "hyper-agent";
    public bool Required => true;

    private readonly IHyperAgentReadClient? _reader;

    public HyperAgentProbe(IHyperAgentReadClient? reader)
    {
        _reader = reader;
    }

    public async Task<HealthCheckResult> CheckAsync(CancellationToken cancellationToken)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        if (_reader is null)
        {
            sw.Stop();
            return HealthCheckResult.Degraded(Name, sw.ElapsedMilliseconds, "no Hyper Agent client registered");
        }

        try
        {
            await _reader.GetVersionAsync(cancellationToken);
            sw.Stop();
            return HealthCheckResult.Healthy(Name, sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return HealthCheckResult.Unhealthy(Name, sw.ElapsedMilliseconds, ex.GetType().Name);
        }
    }
}
