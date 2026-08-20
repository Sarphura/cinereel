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
    public async Task CreatePersistsDriveAndOwnership()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:one", "电影资料");

        var result = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);

        Assert.Equal(CreateDriveResultCode.Created, result.ResultCode);
        Assert.NotNull(result.Drive);
        Assert.Equal(input.Request.Name, result.Drive.Name);
        Assert.Equal(input.Request.ContentTypeId, result.Drive.ContentTypeId);
        Assert.Equal("ownership", result.Drive.Relation);
        Assert.Single(fixture.HyperClient.CreateCalls);
        Assert.Equal(result.Drive.DriveId, fixture.HyperClient.CreateCalls[0].DriveId.Value);
        Assert.Equal(1, await fixture.DbContext.Drives.CountAsync());
        Assert.Equal(1, await fixture.DbContext.DriveOwnerships.CountAsync());
    }

    [Fact]
    public async Task SameIdempotencyKeyAndRequestReplaysResult()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:replay", "电影资料");

        var created = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);
        var replayed = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);

        Assert.Equal(CreateDriveResultCode.Replayed, replayed.ResultCode);
        Assert.Equal(created.Drive, replayed.Drive);
        Assert.Single(fixture.HyperClient.CreateCalls);
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
        Assert.Single(fixture.HyperClient.CreateCalls);
    }

    [Fact]
    public async Task LocalCommitFailureDeletesCreatedHyperDrive()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        await fixture.RejectDriveInsertsAsync();

        var input = CreateInput("create:compensate", "电影资料");
        await Assert.ThrowsAsync<DbUpdateException>(() => fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None));

        Assert.Single(fixture.HyperClient.DeleteCalls);
        Assert.Equal(0, await fixture.DbContext.Drives.CountAsync());
        Assert.Equal(0, await fixture.DbContext.DriveOwnerships.CountAsync());
        var operation = await fixture.DbContext.DriveCreationOperations
            .AsNoTracking()
            .SingleAsync();
        Assert.Equal(DriveCreationOperationStatus.Compensated, operation.Status);
        Assert.Equal(1, operation.CompensationAttemptCount);
    }

    [Fact]
    public async Task FailedCompensationRemainsRecoverable()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        await fixture.RejectDriveInsertsAsync();
        fixture.HyperClient.DeleteException = new HttpRequestException("不可用");

        var input = CreateInput("create:recover", "电影资料");
        await Assert.ThrowsAsync<DbUpdateException>(() => fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None));

        fixture.HyperClient.DeleteException = null;
        await fixture.Service.RecoverIncompleteCreationsAsync(CancellationToken.None);

        Assert.Equal(2, fixture.HyperClient.DeleteCalls.Count);
        var operation = await fixture.DbContext.DriveCreationOperations
            .AsNoTracking()
            .SingleAsync();
        Assert.Equal(DriveCreationOperationStatus.Compensated, operation.Status);
        Assert.Equal(2, operation.CompensationAttemptCount);
    }

    [Fact]
    public async Task RecoveryContinuesAfterOneOperationFails()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var driveKey = new string('d', 64);
        fixture.DbContext.DriveCreationOperations.AddRange(
            new DriveCreationOperationEntity
            {
                IdempotencyKey = "recover:invalid",
                RequestHash = new string('0', 64),
                DriveId = Guid.NewGuid(),
                Name = string.Empty,
                ContentTypeId = DriveContentTypeId.MovieValue,
                Status = DriveCreationOperationStatus.Pending,
                CreatedAt = now,
                UpdatedAt = now
            },
            new DriveCreationOperationEntity
            {
                IdempotencyKey = "recover:valid",
                RequestHash = new string('1', 64),
                DriveId = Guid.NewGuid(),
                Name = "电影资料",
                ContentTypeId = DriveContentTypeId.MovieValue,
                Status = DriveCreationOperationStatus.HyperDriveCreated,
                DriveKey = driveKey,
                CreatedAt = now,
                UpdatedAt = now
            });
        await fixture.DbContext.SaveChangesAsync();

        await fixture.Service.RecoverIncompleteCreationsAsync(CancellationToken.None);

        Assert.Equal(driveKey, Assert.Single(fixture.HyperClient.DeleteCalls).Value);
        var recovered = await fixture.DbContext.DriveCreationOperations
            .AsNoTracking()
            .SingleAsync(operation => operation.IdempotencyKey == "recover:valid");
        Assert.Equal(DriveCreationOperationStatus.Compensated, recovered.Status);
    }

    [Fact]
    public async Task ListAndGetReturnOwnedDrives()
    {
        await using var fixture = await DriveServiceFixture.CreateAsync();
        var input = CreateInput("create:query", "电影资料");
        var created = await fixture.Service.CreateAsync(
            input.IdempotencyKey,
            input.Request,
            CancellationToken.None);

        var found = await fixture.Service.GetAsync(
            new DriveId(created.Drive!.DriveId),
            CancellationToken.None);
        var listed = await fixture.Service.ListAsync(CancellationToken.None);

        Assert.Equal(created.Drive, found);
        Assert.Equal(created.Drive, Assert.Single(listed));
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
            Assert.True(DriveKey.TryCreate(new string('c', 64), out var driveKey));
            var hyperClient = new TestHyperClient(driveKey);
            var service = new DriveService(
                new DriveRepository(dbContext),
                new DriveOwnershipRepository(dbContext),
                new DriveCreationOperationRepository(dbContext),
                new UnitOfWork(dbContext),
                hyperClient,
                new DriveCreationLock(),
                TimeProvider.System,
                NullLogger<DriveService>.Instance);
            return new DriveServiceFixture(connection, dbContext, hyperClient, service);
        }

        internal Task RejectDriveInsertsAsync() => DbContext.Database.ExecuteSqlRawAsync(
            """
            CREATE TRIGGER RejectDriveInsert
            BEFORE INSERT ON Drives
            BEGIN
                SELECT RAISE(FAIL, '测试本地提交失败');
            END;
            """);

        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }
}
