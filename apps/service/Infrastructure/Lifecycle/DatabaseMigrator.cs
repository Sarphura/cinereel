using CineReel.Service.Data;
using Microsoft.EntityFrameworkCore;

namespace CineReel.Service.Infrastructure.Lifecycle;

/// <summary>
/// Runs <see cref="Microsoft.EntityFrameworkCore.RelationalDatabaseFacadeExtensions.MigrateAsync"/>
/// at startup so a fresh deployment does not require a separate migration
/// command. Failures abort the host with a non-zero exit code
/// and log the migration that failed so the operator can diagnose.
/// </summary>
public static class DatabaseMigrator
{
    public static async Task MigrateAsync(IServiceProvider services, CancellationToken ct)
    {
        var factory = services.GetService(typeof(IDbContextFactory<CinereelDbContext>)) as IDbContextFactory<CinereelDbContext>;
        if (factory is null)
        {
            // No DB configured (test fixture etc) — skip. The rest of the
            // App Server will surface the missing DbContext elsewhere.
            return;
        }

        ILogger logger = services.GetService(typeof(ILogger<>).MakeGenericType(typeof(DatabaseMigrator))) as ILogger
            ?? services.GetRequiredService<ILoggerFactory>().CreateLogger("CineReel.DbMigrate");

        await using var db = await factory.CreateDbContextAsync(ct);
        try
        {
            await db.Database.MigrateAsync(ct);
            logger.LogInformation("[app-server] migrations applied");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "EF Core migration failed; aborting startup");
            throw;
        }
    }
}
