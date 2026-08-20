using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Cinereel.Infrastructure.Persistence;

internal sealed class CinereelDbContextFactory :
    IDesignTimeDbContextFactory<CinereelDbContext>
{
    public CinereelDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<CinereelDbContext>()
            .UseSqlite("Data Source=cinereel-design.db")
            .Options;

        return new CinereelDbContext(options);
    }
}
