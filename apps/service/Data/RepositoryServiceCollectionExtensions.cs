using CineReel.Service.Data.Repositories;
using CineReel.Service.Features.Accounts;
using CineReel.Service.Features.Bt;
using CineReel.Service.Features.Metadata;
using CineReel.Service.Features.Subscription;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Data;

public static class RepositoryServiceCollectionExtensions
{
    public static IServiceCollection AddCinereelRepositories(this IServiceCollection services)
    {
        services.AddScoped<ISubscriptionRepository, EfSubscriptionRepository>();
        services.AddScoped<IMediaItemRepository, EfMediaItemRepository>();
        services.AddScoped<ITorrentFileRepository, EfTorrentFileRepository>();
        services.AddScoped<IAccountRepository, EfAccountRepository>();
        services.AddScoped<ISessionRepository, EfSessionRepository>();
        return services;
    }
}
