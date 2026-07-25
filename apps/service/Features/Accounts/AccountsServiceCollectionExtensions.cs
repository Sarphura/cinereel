using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Features.Accounts;

public static class AccountsServiceCollectionExtensions
{
    public static IServiceCollection AddCinereelAccounts(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IPasswordHasher, Argon2idPasswordHasher>();
        services.AddScoped<IAccountService, AccountService>();
        services.AddScoped<ISessionService, SessionService>();
        services.AddHostedService<SessionExpirySweeper>();
        return services;
    }
}

public static class AuthApplicationBuilderExtensions
{
    public static IApplicationBuilder UseCinereelSessionAuthentication(this WebApplication app)
    {
        return app.UseMiddleware<Infrastructure.Auth.SessionAuthenticationMiddleware>();
    }
}
