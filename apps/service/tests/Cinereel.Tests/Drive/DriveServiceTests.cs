using Cinereel.Features.Drive;
using Cinereel.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveServiceTests
{
    [Fact]
    public async Task CreatePersistsPendingDriveWithoutCallingHyperClient()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:pending", "电影资料");

        var result = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);

        Assert.Equal(CreateDriveResultCode.Accepted, result.ResultCode);
        Assert.NotNull(result.Drive);
        Assert.Equal("pending", result.Drive.Status);
        Assert.Null(result.Drive.DriveKey);
        Assert.Empty(fixture.HyperClient.CreateCalls);
        var saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(DriveStatus.Pending, saved.Status);
        Assert.Equal(input.IdempotencyKey.Value, saved.IdempotencyKey);
    }

    [Fact]
    public async Task SameIdempotencyKeyAndRequestReturnsSamePendingDrive()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:replay-pending", "电影资料");

        var first = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);
        var repeated = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);

        Assert.Equal(CreateDriveResultCode.Accepted, repeated.ResultCode);
        Assert.Equal(first.Drive, repeated.Drive);
        Assert.Equal(1, await fixture.DbContext.Drives.CountAsync());
    }

    [Fact]
    public async Task SameIdempotencyKeyWithDifferentRequestConflicts()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var original = CreateInput("create:conflict", "电影资料");
        await fixture.Service.CreateAsync(
            original.IdempotencyKey,
            original.Request,
            CancellationToken.None);

        var conflicting = CreateInput("create:conflict", "剧集资料");
        var result = await fixture.Service.CreateAsync(
            conflicting.IdempotencyKey,
            conflicting.Request,
            CancellationToken.None);

        Assert.Equal(CreateDriveResultCode.IdempotencyConflict, result.ResultCode);
        Assert.Null(result.Drive);
        Assert.Empty(fixture.HyperClient.CreateCalls);
    }

    [Fact]
    public async Task JobCompletesPendingDrive()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:ready", "电影资料");
        var accepted = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);

        await fixture.Service.ProcessPendingCreationsAsync(CancellationToken.None);

        var found = await fixture.Service.GetAsync(
            new DriveId(accepted.Drive!.DriveId),
            CancellationToken.None);
        Assert.NotNull(found);
        Assert.Equal("ready", found.Status);
        Assert.NotNull(found.DriveKey);
        Assert.Equal(accepted.Drive.DriveId, Assert.Single(fixture.HyperClient.CreateCalls).DriveId.Value);

        var replayed = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);
        Assert.Equal(CreateDriveResultCode.Replayed, replayed.ResultCode);
        Assert.Equal(found, replayed.Drive);
    }

    [Fact]
    public async Task FailedDriveCanBeRetried()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:retry", "电影资料");
        var accepted = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);
        fixture.HyperClient.CreateException = new HttpRequestException("不可用");

        await fixture.Service.ProcessPendingCreationsAsync(CancellationToken.None);

        var failed = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(DriveStatus.Failed, failed.Status);

        fixture.HyperClient.CreateException = null;
        var retryResult = await fixture.Service.RetryCreationAsync(
            new DriveId(accepted.Drive!.DriveId),
            CancellationToken.None);
        Assert.Equal(RetryDriveCreationResultCode.Accepted, retryResult);

        await fixture.Service.ProcessPendingCreationsAsync(CancellationToken.None);
        var ready = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(DriveStatus.Ready, ready.Status);
        Assert.NotNull(ready.Key);
    }

    [Fact]
    public async Task ListAndGetIncludePendingDrives()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:query", "电影资料");
        var accepted = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);

        var found = await fixture.Service.GetAsync(
            new DriveId(accepted.Drive!.DriveId),
            CancellationToken.None);
        var listed = await fixture.Service.ListAsync(CancellationToken.None);

        Assert.Equal(accepted.Drive, found);
        Assert.Equal(accepted.Drive, Assert.Single(listed));
    }

    [Fact]
    public async Task UpdateRemarkPersistsOnPendingOwnedDrive()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:remark", "电影资料");
        var accepted = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);
        Assert.True(DriveRemark.TryCreate("我的电影", out var remark));

        var result = await fixture.Service.UpdateRemarkAsync(
            new DriveId(accepted.Drive!.DriveId),
            remark,
            CancellationToken.None);

        Assert.Equal(UpdateDriveRemarkResultCode.Updated, result);
        var saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal("我的电影", saved.Remark);
    }

    [Fact]
    public async Task DeleteMarksDriveDeletedAndPreservesIdempotencyTombstone()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:delete", "电影资料");
        var accepted = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);

        var result = await fixture.Service.DeleteAsync(
            new DriveId(accepted.Drive!.DriveId),
            CancellationToken.None);

        Assert.Equal(DeleteDriveResultCode.Deleted, result);
        var saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(DriveStatus.Deleted, saved.Status);
        Assert.Equal(DriveRelationType.None, saved.RelationType);
        Assert.Null(await fixture.Service.GetAsync(
            new DriveId(accepted.Drive.DriveId),
            CancellationToken.None));
        Assert.Empty(await fixture.Service.ListAsync(CancellationToken.None));

        var replayed = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);
        Assert.Equal(CreateDriveResultCode.Gone, replayed.ResultCode);
    }

    private static CreateDriveInput CreateInput(string idempotencyKey, string name)
    {
        Assert.True(IdempotencyKey.TryCreate(idempotencyKey, out var parsedKey));
        return new CreateDriveInput(
            parsedKey,
            new CreateDriveRequest(name, DriveContentTypeId.MovieValue));
    }

    private sealed record CreateDriveInput(
        IdempotencyKey IdempotencyKey,
        CreateDriveRequest Request);

    private sealed class DriveServiceFixture : IAsyncDisposable
    {
        private readonly SqliteConnection _connection;

        private DriveServiceFixture(
            SqliteConnection connection,
            CinereelDbContext dbContext,
            TestHyperClient hyperClient,
            DriveService service)
        {
            _connection = connection;
            DbContext = dbContext;
            HyperClient = hyperClient;
            Service = service;
        }

        internal CinereelDbContext DbContext { get; }

        internal TestHyperClient HyperClient { get; }

        internal DriveService Service { get; }

        internal static async Task<DriveServiceFixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var options = new DbContextOptionsBuilder<CinereelDbContext>()
                .UseSqlite(connection)
                .Options;
            var dbContext = new CinereelDbContext(options);
            await dbContext.Database.MigrateAsync();
            var hyperClient = new TestHyperClient();
            var service = new DriveService(
                new DriveRepository(dbContext),
                new UnitOfWork(dbContext),
                hyperClient,
                new DriveCreationLock(),
                TimeProvider.System,
                NullLogger<DriveService>.Instance);
            return new DriveServiceFixture(connection, dbContext, hyperClient, service);
        }

        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }
}
