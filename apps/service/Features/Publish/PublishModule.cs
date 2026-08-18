using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Cinereel.Features.Publish;

public static class PublishModule
{
    public static IServiceCollection AddPublishFeature(this IServiceCollection services)
    {
        services.TryAddScoped<IPublishService, PublishService>();
        return services;
    }
}
