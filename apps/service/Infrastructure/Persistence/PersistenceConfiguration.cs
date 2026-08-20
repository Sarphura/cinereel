using Microsoft.EntityFrameworkCore;

namespace Cinereel.Infrastructure.Persistence;

public static class PersistenceConfiguration
{
    public static IServiceCollection AddPersistence(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Cinereel");

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("缺少 ConnectionStrings:Cinereel 配置。");
        }

        services.AddDbContext<CinereelDbContext>(options =>
            options.UseSqlite(connectionString));
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        return services;
    }

    public static async Task MigratePersistenceAsync(
        this WebApplication app,
        CancellationToken cancellationToken = default)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<CinereelDbContext>();
        await dbContext.Database.MigrateAsync(cancellationToken);
    }
}
