using Cinereel.Features.Drive;
using Cinereel.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DrivePersistenceTests
{
    [Fact]
    public void RelationTypeValuesAreStable()
    {
        Assert.Equal(0, (int)DriveRelationType.None);
        Assert.Equal(1, (int)DriveRelationType.Ownership);
        Assert.Equal(2, (int)DriveRelationType.Subscription);
    }

    [Fact]
    public async Task DrivePersistsRelationState()
    {
        await using var fixture = await SqliteFixture.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var driveId = Guid.NewGuid();
        var drive = new DriveEntity
        {
            Id = driveId,
            Key = new string('a', 64),
            Name = "电影资料",
            ContentTypeId = DriveContentTypeId.MovieValue,
            RelationType = DriveRelationType.Ownership,
            Remark = "我的电影",
            CreatedAt = now,
            UpdatedAt = now
        };

        fixture.DbContext.Drives.Add(drive);
        await fixture.DbContext.SaveChangesAsync();

        var saved = await fixture.DbContext.Drives.SingleAsync();
        Assert.Equal(DriveRelationType.Ownership, saved.RelationType);
        Assert.Equal("我的电影", saved.Remark);
    }

    [Fact]
    public async Task DriveKeyMustBeUnique()
    {
        await using var fixture = await SqliteFixture.CreateAsync();
        var key = new string('b', 64);
        fixture.DbContext.Drives.AddRange(
            CreateDrive(Guid.NewGuid(), key),
            CreateDrive(Guid.NewGuid(), key));

        await Assert.ThrowsAsync<DbUpdateException>(
            () => fixture.DbContext.SaveChangesAsync());
    }

    private static DriveEntity CreateDrive(Guid id, string key)
    {
        var now = DateTimeOffset.UtcNow;
        return new DriveEntity
        {
            Id = id,
            Key = key,
            Name = "Drive",
            ContentTypeId = DriveContentTypeId.GenericValue,
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    private sealed class SqliteFixture : IAsyncDisposable
    {
        private readonly SqliteConnection _connection;

        private SqliteFixture(
            SqliteConnection connection,
            CinereelDbContext dbContext)
        {
            _connection = connection;
            DbContext = dbContext;
        }

        internal CinereelDbContext DbContext { get; }

        internal static async Task<SqliteFixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var options = new DbContextOptionsBuilder<CinereelDbContext>()
                .UseSqlite(connection)
                .Options;
            var dbContext = new CinereelDbContext(options);
            await dbContext.Database.MigrateAsync();
            return new SqliteFixture(connection, dbContext);
        }

        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }
}
