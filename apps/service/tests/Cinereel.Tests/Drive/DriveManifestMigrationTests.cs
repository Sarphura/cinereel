using Cinereel.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveManifestMigrationTests
{
    [Fact]
    public async Task UpgradeQueuesExistingOwnershipAndPreservesLocalFields()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new CinereelDbContext(new DbContextOptionsBuilder<CinereelDbContext>()
            .UseSqlite(connection).Options);
        await db.GetService<IMigrator>().MigrateAsync("20260820135548_InitialCreate");
        var id = Guid.NewGuid();
        var timestamp = new DateTimeOffset(2026, 9, 1, 8, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "Drives"
                ("Id", "Key", "Name", "ContentTypeId", "Status", "RelationType", "Remark", "CreatedAt", "UpdatedAt", "IdempotencyKey")
            VALUES ({id}, {new string('a', 64)}, {"原有名称"}, {"cinereel.movie"}, {"Ready"}, {1}, {"私有备注"}, {timestamp}, {timestamp}, {"migration:owned"});
            """);
        await db.Database.MigrateAsync();
        var drive = await db.Drives.SingleAsync();
        Assert.Equal(id, drive.Id);
        Assert.Equal("原有名称", drive.Name);
        Assert.Equal("私有备注", drive.Remark);
        Assert.Equal(string.Empty, drive.Description);
        Assert.Equal(drive.CreatedAt, drive.ManifestCreatedAt);
        Assert.Equal(drive.CreatedAt, drive.ManifestUpdatedAt);
        Assert.Equal(1, drive.ManifestRevision);
        Assert.Equal(0, drive.ManifestSyncedRevision);
    }
}
