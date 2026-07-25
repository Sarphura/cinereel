using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace CineReel.Service.Data;

public sealed class CinereelDbContextFactory : IDesignTimeDbContextFactory<CinereelDbContext>
{
    public CinereelDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<CinereelDbContext>()
            .UseSqlite("Data Source=cinereel.db")
            .Options;
        return new CinereelDbContext(options);
    }
}
