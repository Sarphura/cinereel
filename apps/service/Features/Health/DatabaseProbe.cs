using Microsoft.EntityFrameworkCore;
using CineReel.Service.Data;

namespace CineReel.Service.Features.Health;

/// <summary>
/// Database probe that resolves an `IDbContextFactory` lazily via the
/// singleton-scoped service provider. If no factory is registered
/// (e.g. minimal smoke-test boots) the probe reports `degraded` instead
/// of throwing — the test factory wires a fake factory for full coverage.
/// </summary>
public sealed class DatabaseProbe : IHealthProbe
{
    public string Name => "database";
    public bool Required => true;

    private readonly IServiceProvider _services;

    public DatabaseProbe(IServiceProvider services)
    {
        _services = services;
    }

    public async Task<HealthCheckResult> CheckAsync(CancellationToken cancellationToken)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var factory = _services.GetService(typeof(IDbContextFactory<CinereelDbContext>)) as IDbContextFactory<CinereelDbContext>;
        if (factory is null)
        {
            sw.Stop();
            return HealthCheckResult.Degraded(Name, sw.ElapsedMilliseconds, "no DbContextFactory registered");
        }

        try
        {
            await using var db = await factory.CreateDbContextAsync(cancellationToken);
            await db.Database.ExecuteSqlRawAsync("SELECT 1", cancellationToken);
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
