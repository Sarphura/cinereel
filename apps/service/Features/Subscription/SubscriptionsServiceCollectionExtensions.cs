using CineReel.Service.Features.Subscription;
using CineReel.Service.Domain.Common;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CineReel.Service.Features.Subscription;

public static class SubscriptionServiceCollectionExtensions
{
    /// <summary>
    /// Registers `ISubscriptionService` with the `InMemorySubscriptionRepository`
    /// for unit tests. Production wiring in `Program.cs` re-registers a
    /// SQLite-backed repository and overrides the self-detector.
    /// </summary>
    public static IServiceCollection AddCinereelSubscriptions(this IServiceCollection services)
    {
        services.TryAddSingleton<InMemorySubscriptionRepository>();
        services.TryAddSingleton<ISubscriptionRepository>(sp => sp.GetRequiredService<InMemorySubscriptionRepository>());
        services.TryAddSingleton<Func<DriveKey, bool>>(_ => _ => false);
        services.TryAddSingleton<ISubscriptionService, SubscriptionService>();
        return services;
    }
}
