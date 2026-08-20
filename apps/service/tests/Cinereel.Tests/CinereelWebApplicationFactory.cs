using Cinereel.Features.Drive;
using Cinereel.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Cinereel.Tests;

public sealed class CinereelWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databasePath = Path.Combine(
        Path.GetTempPath(),
        $"cinereel-tests-{Guid.NewGuid():N}.db");

    internal Drive.TestHyperClient HyperClient { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<CinereelDbContext>();
            services.RemoveAll<DbContextOptions<CinereelDbContext>>();
            services.AddDbContext<CinereelDbContext>(options =>
                options.UseSqlite($"Data Source={_databasePath}"));

            services.RemoveAll<IHyperClient>();
            services.AddSingleton<IHyperClient>(HyperClient);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (disposing)
        {
            File.Delete(_databasePath);
            File.Delete(_databasePath + "-shm");
            File.Delete(_databasePath + "-wal");
        }
    }
}
