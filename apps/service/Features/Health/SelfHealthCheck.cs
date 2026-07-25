using HealthCheckResultAlias = Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult;
using HealthCheckContextAlias = Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckContext;
using IHealthCheckAlias = Microsoft.Extensions.Diagnostics.HealthChecks.IHealthCheck;

namespace CineReel.Service.Features.Health;

/// <summary>
/// Trivial required probe used by the legacy `/health` endpoint that the
/// infrastructure's `AddHealthChecks()` call wires up. Returns `Healthy`
/// when the App Server's request loop is responsive — i.e. the App
/// Server itself is alive. The full aggregator lives at `/api/health`.
/// </summary>
public sealed class SelfHealthCheck : IHealthCheckAlias
{
    public Task<HealthCheckResultAlias> CheckHealthAsync(
        HealthCheckContextAlias context,
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult(HealthCheckResultAlias.Healthy(
            description: "Application Server is responsive."));
    }
}
