using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace CineReel.Service.Features.Health;

/// <summary>
/// Required health check: the Application Server is reachable and responsive.
/// Per ADR 0040 this is a "required" check — a 200 means the service can accept requests,
/// a 503 means an operator should investigate before the Sidecar / MonoTorrent sessions
/// attempt to talk to it.
/// </summary>
public sealed class SelfHealthCheck : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult(HealthCheckResult.Healthy(
            description: "Application Server is responsive."));
    }
}
