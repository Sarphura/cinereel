using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Cinereel.Features.Drive;

public static class DriveConfiguration
{
    private static readonly TimeSpan HyperClientConnectTimeout = TimeSpan.FromSeconds(100);

    public static IServiceCollection AddDriveFeature(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var baseAddressValue = configuration["HyperClient:BaseAddress"];

        if (!Uri.TryCreate(baseAddressValue, UriKind.Absolute, out var baseAddress) ||
            baseAddress.Scheme is not ("http" or "https"))
        {
            throw new InvalidOperationException(
                "HyperClient:BaseAddress 必须是绝对 HTTP 或 HTTPS 地址。");
        }

        var normalizedBaseAddress = new Uri(
            baseAddress.AbsoluteUri.TrimEnd('/') + "/",
            UriKind.Absolute);
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton<DriveCreationLock>();
        services.AddScoped<IDriveRepository, DriveRepository>();
        services.AddScoped<DriveService>();
        services.AddScoped<IDriveService>(provider =>
            provider.GetRequiredService<DriveService>());
        services.TryAddScoped<IDriveFileService, DriveFileService>();
        services.TryAddScoped<IPublishService, PublishService>();
        services.Configure<Microsoft.AspNetCore.OpenApi.OpenApiOptions>("v1", options =>
            options.AddOperationTransformer(new DriveFileOpenApiConfiguration()));
        services.Configure<Swashbuckle.AspNetCore.SwaggerGen.SwaggerGenOptions>(options =>
            options.OperationFilter<DriveFileOpenApiConfiguration>());
        services.AddHttpClient<IHyperClient, HyperClient>(client =>
            {
                client.BaseAddress = normalizedBaseAddress;
                client.Timeout = Timeout.InfiniteTimeSpan;
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                ConnectTimeout = HyperClientConnectTimeout
            });
        services.AddHostedService<DriveCreationJob>();
        return services;
    }
}
