namespace CineReel.Service.Features.Health;

/// <summary>
/// Implemented by every probe that contributes to the <c>/api/health</c>
/// response. A probe is registered as required when its failure must
/// flip the endpoint from 200 to 503, and as optional when the failure
/// only flips the overall status to `degraded`.
/// </summary>
public interface IHealthProbe
{
    string Name { get; }
    bool Required { get; }
    Task<HealthCheckResult> CheckAsync(CancellationToken cancellationToken);
}
