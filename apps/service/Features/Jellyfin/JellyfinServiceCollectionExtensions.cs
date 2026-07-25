using CineReel.Service.Features.Jellyfin;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CineReel.Service.Features.Jellyfin;

public static class JellyfinServiceCollectionExtensions
{
    public static IServiceCollection AddCinereelJellyfin(this IServiceCollection services)
    {
        services.TryAddSingleton<AsyncKeyedLock>();
        services.TryAddSingleton<IJellyfinHttpClient>(sp =>
            new LocalJellyfinHttpClient(sp.GetRequiredService<Infrastructure.Settings.CinereelOptions>().Jellyfin.LibraryRoot));
        services.TryAddSingleton<IJellyfinPusher, JellyfinPusher>();
        services.TryAddSingleton<IJellyfinCleaner, JellyfinCleaner>();
        return services;
    }
}