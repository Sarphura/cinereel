using Ardalis.Result;
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

        Assert.Equal(ResultStatus.Created, result.Status);
        Assert.NotNull(result.Value);
        Assert.Equal("pending", result.Value.Status);
        Assert.Null(result.Value.DriveKey);
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

        Assert.Equal(ResultStatus.Created, repeated.Status);
        Assert.Equal(first.Value, repeated.Value);
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

        Assert.Equal(ResultStatus.Conflict, result.Status);
        Assert.Null(result.Value);
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
            new DriveId(accepted.Value!.DriveId),
            CancellationToken.None);
        Assert.Equal(ResultStatus.Ok, found.Status);
        Assert.Equal("ready", found.Value!.Status);
        Assert.NotNull(found.Value.DriveKey);
        Assert.Equal(accepted.Value.DriveId, Assert.Single(fixture.HyperClient.CreateCalls).DriveId.Value);

        var replayed = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);
        Assert.Equal(ResultStatus.Ok, replayed.Status);
        Assert.Equal(found.Value, replayed.Value);
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
            new DriveId(accepted.Value!.DriveId),
            CancellationToken.None);
        Assert.Equal(ResultStatus.Created, retryResult.Status);

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
            new DriveId(accepted.Value!.DriveId),
            CancellationToken.None);
        var listed = await fixture.Service.ListAsync(CancellationToken.None);

        Assert.Equal(ResultStatus.Ok, found.Status);
        Assert.Equal(accepted.Value, found.Value);
        Assert.Equal(accepted.Value, Assert.Single(listed.Value!));
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
            new DriveId(accepted.Value!.DriveId),
            remark,
            CancellationToken.None);

        Assert.Equal(ResultStatus.NoContent, result.Status);
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
            new DriveId(accepted.Value!.DriveId),
            CancellationToken.None);

        Assert.Equal(ResultStatus.NoContent, result.Status);
        var saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(DriveStatus.Deleted, saved.Status);
        Assert.Equal(DriveRelationType.None, saved.RelationType);
        var missing = await fixture.Service.GetAsync(
            new DriveId(accepted.Value.DriveId),
            CancellationToken.None);
        Assert.Equal(ResultStatus.NotFound, missing.Status);
        var listed = await fixture.Service.ListAsync(CancellationToken.None);
        Assert.Empty(listed.Value!);

        var replayed = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);
        Assert.Equal(ResultStatus.NotFound, replayed.Status);
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
