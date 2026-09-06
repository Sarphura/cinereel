using Cinereel.Features.Drive;
using Cinereel.Infrastructure.Persistence;
using Ardalis.Result;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class SubscriptionServiceTests
{
    private static readonly DateTimeOffset LocalNow = DateTimeOffset.Parse("2026-09-05T10:00:00Z");
    private static readonly DriveManifest Manifest = new(
        1, "远端电影", DriveContentTypeId.MovieValue, "公开说明",
        DateTimeOffset.Parse("2025-01-01T00:00:00Z"),
        DateTimeOffset.Parse("2026-09-04T09:00:00Z"));

    [Fact]
    public async Task CreateReadsByKeyBeforePersistingLocalSubscriptionAndCachesPublicTimes()
    {
        await using var fixture = await SubscriptionFixture.CreateAsync();
        fixture.ManifestService.BeforeRead = async () =>
            Assert.Empty(await fixture.DbContext.Drives.ToListAsync());

        var result = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);

        Assert.Equal(ResultStatus.Created, result.Status);
        var response = Assert.IsType<DriveDescriptionResponse>(result.Value);
        var saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.NotEqual(Guid.Empty, saved.Id);
        Assert.Equal(saved.Id, response.DriveId);
        Assert.Equal(fixture.DriveKey.Value, saved.Key);
        Assert.Equal(DriveStatus.Ready, saved.Status);
        Assert.Equal(DriveRelationType.Subscription, saved.RelationType);
        Assert.Equal(LocalNow, saved.CreatedAt);
        Assert.Equal(Manifest.CreatedAt, saved.ManifestCreatedAt);
        Assert.Equal(Manifest.CreatedAt, response.CreatedAt);
        Assert.Equal(Manifest.UpdatedAt, response.UpdatedAt);
        Assert.Equal(Manifest.Name, response.Name);
        Assert.Equal(Manifest.ContentTypeId, response.ContentTypeId);
        Assert.Equal(Manifest.Description, response.Description);
        Assert.Equal("cached", response.SyncStatus);
        Assert.Equal(fixture.DriveKey, Assert.Single(fixture.ManifestService.ReadKeys));
    }

    [Theory]
    [InlineData("NotFound", ResultStatus.Invalid, ResultStatus.Invalid)]
    [InlineData("Invalid", ResultStatus.Invalid, ResultStatus.Invalid)]
    [InlineData("TooLarge", ResultStatus.Invalid, ResultStatus.Invalid)]
    [InlineData("UnsupportedSchema", ResultStatus.Invalid, ResultStatus.Invalid)]
    [InlineData("UnsupportedContentType", ResultStatus.Invalid, ResultStatus.Invalid)]
    [InlineData("Unavailable", ResultStatus.CriticalError, ResultStatus.CriticalError)]
    [InlineData("Timeout", ResultStatus.CriticalError, ResultStatus.CriticalError)]
    public async Task FailedReadNeverCreatesRelationshipOrReplacesExistingCacheAndRemark(
        string readResultName,
        ResultStatus expectedCreate,
        ResultStatus expectedRefresh)
    {
        await using var fixture = await SubscriptionFixture.CreateAsync();
        var failure = new ReadDriveManifestResult(Enum.Parse<ReadDriveManifestResultCode>(readResultName));
        fixture.ManifestService.Result = failure;

        var rejected = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);

        Assert.Equal(expectedCreate, rejected.Status);
        Assert.Null(rejected.Value);
        Assert.Empty(await fixture.DbContext.Drives.ToListAsync());

        fixture.ManifestService.Result = new(ReadDriveManifestResultCode.Success, Manifest);
        var created = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);
        var saved = await fixture.DbContext.Drives.SingleAsync();
        saved.Remark = "我的备注";
        await fixture.DbContext.SaveChangesAsync();
        fixture.ManifestService.Result = failure;

        var refreshed = await fixture.Service.RefreshAsync(
            new DriveId(created.Value!.DriveId), CancellationToken.None);

        Assert.Equal(expectedRefresh, refreshed.Status);
        Assert.Null(refreshed.Value);
        saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(Manifest.Name, saved.Name);
        Assert.Equal(Manifest.Description, saved.Description);
        Assert.Equal(Manifest.ContentTypeId, saved.ContentTypeId);
        Assert.Equal(Manifest.CreatedAt, saved.ManifestCreatedAt);
        Assert.Equal(Manifest.UpdatedAt, saved.ManifestUpdatedAt);
        Assert.Equal(LocalNow, saved.UpdatedAt);
        Assert.Equal("我的备注", saved.Remark);
        Assert.Equal(DriveRelationType.Subscription, saved.RelationType);
    }

    [Fact]
    public async Task RefreshUpdatesPublicDescriptionAndPreservesLocalIdentityAndRemark()
    {
        await using var fixture = await SubscriptionFixture.CreateAsync();
        var created = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);
        var driveId = new DriveId(created.Value!.DriveId);
        var saved = await fixture.DbContext.Drives.SingleAsync();
        saved.Remark = "我的备注";
        await fixture.DbContext.SaveChangesAsync();
        var changed = Manifest with
        {
            Name = "新的名称",
            Description = "新的公开说明",
            ContentTypeId = DriveContentTypeId.SeriesValue,
            UpdatedAt = Manifest.UpdatedAt.AddHours(1)
        };
        fixture.ManifestService.Result = new(ReadDriveManifestResultCode.Success, changed);

        var refreshed = await fixture.Service.RefreshAsync(driveId, CancellationToken.None);

        Assert.Equal(ResultStatus.Ok, refreshed.Status);
        Assert.Equal(driveId.Value, refreshed.Value!.DriveId);
        Assert.Equal(changed.Name, refreshed.Value.Name);
        Assert.Equal(changed.ContentTypeId, refreshed.Value.ContentTypeId);
        Assert.Equal(changed.Description, refreshed.Value.Description);
        Assert.Equal(changed.UpdatedAt, refreshed.Value.UpdatedAt);
        saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(LocalNow, saved.CreatedAt);
        Assert.Equal("我的备注", saved.Remark);
    }

    [Fact]
    public async Task RepeatedCreateReturnsCachedSubscriptionWithoutRemoteRead()
    {
        await using var fixture = await SubscriptionFixture.CreateAsync();
        var created = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);
        fixture.ManifestService.Result = new(ReadDriveManifestResultCode.Unavailable);

        var repeated = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);

        Assert.Equal(ResultStatus.Ok, repeated.Status);
        Assert.Equal(created.Value, repeated.Value);
        Assert.Single(fixture.ManifestService.ReadKeys);
        Assert.Equal(1, await fixture.DbContext.Drives.CountAsync());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ExistingOwnershipAndDeletedTombstoneCannotBecomeSubscription(bool deleted)
    {
        await using var fixture = await SubscriptionFixture.CreateAsync();
        var created = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);
        var saved = await fixture.DbContext.Drives.SingleAsync();
        saved.Status = deleted ? DriveStatus.Deleted : DriveStatus.Ready;
        saved.RelationType = deleted ? DriveRelationType.None : DriveRelationType.Ownership;
        await fixture.DbContext.SaveChangesAsync();
        fixture.ManifestService.ReadKeys.Clear();

        var result = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);
        var refreshed = await fixture.Service.RefreshAsync(
            new DriveId(created.Value!.DriveId), CancellationToken.None);
        var removed = await fixture.Service.DeleteAsync(
            new DriveId(created.Value.DriveId), CancellationToken.None);

        Assert.Equal(ResultStatus.Conflict, result.Status);
        Assert.Equal(ResultStatus.NotFound, refreshed.Status);
        Assert.Equal(ResultStatus.NotFound, removed.Status);
        Assert.Empty(fixture.ManifestService.ReadKeys);
        saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(deleted ? DriveStatus.Deleted : DriveStatus.Ready, saved.Status);
        Assert.Equal(deleted ? DriveRelationType.None : DriveRelationType.Ownership, saved.RelationType);
    }

    [Fact]
    public async Task CancelClearsLocalRemarkAndResubscriptionRestoresSameLocalIdentity()
    {
        await using var fixture = await SubscriptionFixture.CreateAsync();
        var created = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);
        var driveId = new DriveId(created.Value!.DriveId);
        var saved = await fixture.DbContext.Drives.SingleAsync();
        saved.Remark = "本地备注";
        await fixture.DbContext.SaveChangesAsync();
        fixture.ManifestService.ReadKeys.Clear();

        var deleted = await fixture.Service.DeleteAsync(driveId, CancellationToken.None);

        Assert.Equal(ResultStatus.NoContent, deleted.Status);
        saved = await fixture.DbContext.Drives.AsNoTracking().SingleAsync();
        Assert.Equal(DriveRelationType.None, saved.RelationType);
        Assert.Equal(DriveStatus.Ready, saved.Status);
        Assert.Null(saved.Remark);
        Assert.Empty(fixture.ManifestService.ReadKeys);
        Assert.Equal(ResultStatus.NotFound,
            (await fixture.Service.RefreshAsync(driveId, CancellationToken.None)).Status);

        var restored = await fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);

        Assert.Equal(ResultStatus.Created, restored.Status);
        Assert.Equal(driveId.Value, restored.Value!.DriveId);
        Assert.Equal(1, await fixture.DbContext.Drives.CountAsync());
        Assert.Single(fixture.ManifestService.ReadKeys);
    }

    [Fact]
    public async Task ConcurrentCreateForSameKeyReadsAndPersistsOnlyOnce()
    {
        await using var fixture = await SubscriptionFixture.CreateAsync();
        var reading = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.ManifestService.BeforeRead = async () =>
        {
            reading.SetResult();
            await release.Task;
        };

        var first = fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);
        await reading.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var second = fixture.Service.CreateAsync(fixture.DriveKey, CancellationToken.None);
        Assert.False(second.IsCompleted);
        release.SetResult();
        var results = await Task.WhenAll(first, second).WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(ResultStatus.Created, results[0].Status);
        Assert.Equal(ResultStatus.Ok, results[1].Status);
        Assert.Equal(results[0].Value, results[1].Value);
        Assert.Single(fixture.ManifestService.ReadKeys);
        Assert.Equal(1, await fixture.DbContext.Drives.CountAsync());
    }

    private sealed class SubscriptionFixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection;

        private SubscriptionFixture(SqliteConnection connection, CinereelDbContext dbContext)
        {
            this.connection = connection;
            DbContext = dbContext;
            Assert.True(DriveKey.TryCreate(new string('e', 64), out var driveKey));
            DriveKey = driveKey;
            Service = new SubscriptionService(
                new DriveRepository(dbContext),
                new UnitOfWork(dbContext),
                ManifestService,
                new DriveCreationLock(),
                new FixedTimeProvider());
        }

        internal CinereelDbContext DbContext { get; }
        internal DriveKey DriveKey { get; }
        internal StubManifestService ManifestService { get; } = new();
        internal SubscriptionService Service { get; }

        internal static async Task<SubscriptionFixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var options = new DbContextOptionsBuilder<CinereelDbContext>().UseSqlite(connection).Options;
            var dbContext = new CinereelDbContext(options);
            await dbContext.Database.MigrateAsync();
            return new SubscriptionFixture(connection, dbContext);
        }

        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => LocalNow;
    }

    private sealed class StubManifestService : IDriveManifestService
    {
        internal List<DriveKey> ReadKeys { get; } = [];
        internal ReadDriveManifestResult Result { get; set; } = new(ReadDriveManifestResultCode.Success, Manifest);
        internal Func<Task>? BeforeRead { get; set; }

        public async Task<ReadDriveManifestResult> ReadAsync(DriveKey driveKey, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            ReadKeys.Add(driveKey);
            if (BeforeRead is not null)
            {
                await BeforeRead();
            }

            return Result;
        }

        public Task<WriteDriveManifestResult> WriteAsync(
            DriveKey driveKey,
            DriveManifest manifest,
            string? expectedETag,
            CancellationToken cancellationToken) => throw new InvalidOperationException("订阅不得写入远端 Manifest。");
    }
}
