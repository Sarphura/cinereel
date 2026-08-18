using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Cinereel.Features.SystemInfo;

public static class SystemInfoModule
{
    public static IServiceCollection AddSystemInfoFeature(this IServiceCollection services)
    {
        services.TryAddSingleton<SystemInfoReader>();
        return services;
    }

    public static IEndpointRouteBuilder MapSystemInfoFeature(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/system-info")
            .WithTags("System");

        group.MapGetSystemInfo();
        return endpoints;
    }
}
