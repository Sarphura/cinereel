using CineReel.Service.Infrastructure.Settings;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CineReel.Service.Features.Health;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/health", async (HttpContext ctx, HealthAggregator aggregator) =>
        {
            var report = await aggregator.RunAsync(ctx.RequestAborted);
            var payload = new
            {
                status = ToWireStatus(report.Status),
                version = report.Version,
                checks = report.Checks.ToDictionary(
                    kv => kv.Key,
                    kv => new
                    {
                        status = kv.Value.Status.ToString().ToLowerInvariant(),
                        latencyMs = kv.Value.LatencyMs,
                        detail = kv.Value.Detail,
                    }),
            };
            ctx.Response.StatusCode = report.Status == HealthAggregateStatus.Unhealthy
                ? StatusCodes.Status503ServiceUnavailable
                : StatusCodes.Status200OK;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsJsonAsync(payload, ctx.RequestAborted);
        });

        return endpoints;
    }

    private static string ToWireStatus(HealthAggregateStatus status) => status switch
    {
        HealthAggregateStatus.Healthy => "healthy",
        HealthAggregateStatus.Degraded => "degraded",
        HealthAggregateStatus.Unhealthy => "unhealthy",
        _ => "unknown",
    };
}

public static class HealthServiceCollectionExtensions
{
    public static IServiceCollection AddCinereelHealth(this IServiceCollection services)
    {
        services.AddSingleton<HealthAggregator>();
        services.AddSingleton<IHealthProbe, HyperAgentProbe>();
        services.AddSingleton<IHealthProbe, DatabaseProbe>();
        services.AddSingleton<IHealthProbe, JellyfinHealthProbe>();
        services.AddSingleton<IHealthProbe, BtEngineHealthProbe>();
        services.AddSingleton<IHealthProbe, DiskSpaceProbe>();
        services.AddHttpClient(JellyfinHttpClient.Name, client =>
        {
            client.Timeout = TimeSpan.FromSeconds(10);
        });
        return services;
    }
}
