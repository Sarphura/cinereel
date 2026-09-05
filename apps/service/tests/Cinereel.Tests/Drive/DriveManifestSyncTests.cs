using System.Text;
using Cinereel.Features.Drive;
using Cinereel.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class DriveManifestSyncTests
{
    [Fact]
    public async Task CreationBecomesReadyBeforeManifestSyncAndSyncPersistsConfirmation()
    {
        await using var fixture = await Fixture.CreateAsync();
        var id = await fixture.CreateDriveAsync();
        Assert.Empty(fixture.Hyper.WriteProtocolFileCalls);
        var drive = await fixture.Db.Drives.SingleAsync();
        Assert.Equal(DriveStatus.Ready, drive.Status);
        Assert.Equal(1, drive.ManifestRevision);
        Assert.Equal(0, drive.ManifestSyncedRevision);

        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        fixture.Db.ChangeTracker.Clear();
        drive = await fixture.Db.Drives.SingleAsync();
        Assert.Equal(1, drive.ManifestSyncedRevision);
        Assert.Null(drive.ManifestErrorCode);
        var stored = fixture.Hyper.GetProtocolFile(Key(drive));
        var manifest = DriveManifest.Parse(stored.Content!).Manifest!;
        Assert.Equal("电影收藏", manifest.Name);
        Assert.Equal(drive.ManifestCreatedAt, manifest.CreatedAt);
        Assert.DoesNotContain("driveId", Encoding.UTF8.GetString(stored.Content!));
        Assert.Equal("synced", (await fixture.Description.GetAsync(id, CancellationToken.None))!.SyncStatus);
    }

    [Fact]
    public async Task UpdatePersistsIntentBeforeIoAndRejectsStaleRevision()
    {
        await using var fixture = await Fixture.CreateAsync();
        var id = await fixture.CreateDriveAsync();
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        var writes = fixture.Hyper.WriteProtocolFileCalls.Count;
        var result = await fixture.Description.UpdateAsync(id,
            new(" 更新的名称 ", "公开说明", 1), CancellationToken.None);
        Assert.Equal(UpdateDriveDescriptionResultCode.Accepted, result.ResultCode);
        Assert.Equal(2, result.Description!.Revision);
        Assert.Equal(1, result.Description.SyncedRevision);
        Assert.Equal(writes, fixture.Hyper.WriteProtocolFileCalls.Count);
        Assert.Equal("pending", result.Description.SyncStatus);

        var stale = await fixture.Description.UpdateAsync(id,
            new("旧修改", "", 1), CancellationToken.None);
        Assert.Equal(UpdateDriveDescriptionResultCode.RevisionConflict, stale.ResultCode);
        var same = await fixture.Description.UpdateAsync(id,
            new("更新的名称", "公开说明", 2), CancellationToken.None);
        Assert.Equal(UpdateDriveDescriptionResultCode.Unchanged, same.ResultCode);

        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        var drive = await fixture.Db.Drives.SingleAsync();
        Assert.Equal(2, drive.ManifestSyncedRevision);
        var manifest = DriveManifest.Parse(fixture.Hyper.GetProtocolFile(Key(drive)).Content!).Manifest!;
        Assert.Equal("公开说明", manifest.Description);
    }

    [Fact]
    public async Task FailedWriteRemainsReadyAndRecoversWithNewServiceScope()
    {
        await using var fixture = await Fixture.CreateAsync();
        var id = await fixture.CreateDriveAsync();
        fixture.Hyper.WriteProtocolFileException = new HttpRequestException("离线");
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        fixture.Db.ChangeTracker.Clear();
        var failed = await fixture.Db.Drives.SingleAsync();
        Assert.Equal(DriveStatus.Ready, failed.Status);
        Assert.Equal("manifest_unavailable", failed.ManifestErrorCode);
        Assert.Equal(1, failed.ManifestAttempts);
        Assert.NotNull(failed.ManifestNextAttemptAt);
        Assert.Equal("failed", (await fixture.Description.GetAsync(id, CancellationToken.None))!.SyncStatus);

        var calls = fixture.Hyper.WriteProtocolFileCalls.Count;
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        Assert.Equal(calls, fixture.Hyper.WriteProtocolFileCalls.Count);

        fixture.Hyper.WriteProtocolFileException = null;
        fixture.Clock.Advance(TimeSpan.FromMinutes(1));
        await using var recovered = fixture.NewContext();
        await fixture.NewSync(recovered).ProcessPendingAsync(CancellationToken.None);
        var saved = await recovered.Drives.SingleAsync();
        Assert.Equal(saved.ManifestRevision, saved.ManifestSyncedRevision);
        Assert.Null(saved.ManifestErrorCode);
    }

    [Fact]
    public async Task LostWriteResponseIsConfirmedWithConditionalReplacement()
    {
        await using var fixture = await Fixture.CreateAsync();
        await fixture.CreateDriveAsync();
        fixture.Hyper.AfterProtocolWrite = _ => throw new HttpRequestException("响应丢失");
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        Assert.Single(fixture.Hyper.WriteProtocolFileCalls);

        fixture.Hyper.AfterProtocolWrite = null;
        fixture.Clock.Advance(TimeSpan.FromMinutes(1));
        await using var recovered = fixture.NewContext();
        await fixture.NewSync(recovered).ProcessPendingAsync(CancellationToken.None);
        Assert.Equal(2, fixture.Hyper.WriteProtocolFileCalls.Count);
        Assert.Equal(1, (await recovered.Drives.SingleAsync()).ManifestSyncedRevision);
    }

    [Fact]
    public async Task SameValueConfirmationRejectsLateWriteFromEarlierRevision()
    {
        await using var fixture = await Fixture.CreateAsync();
        var id = await fixture.CreateDriveAsync();
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        var drive = await fixture.Db.Drives.SingleAsync();
        var key = Key(drive);
        var original = fixture.Hyper.GetProtocolFile(key);
        await fixture.Description.UpdateAsync(id, new("暂时的名称", "", 1), CancellationToken.None);
        var outdated = new DriveManifest(1, "暂时的名称", drive.ContentTypeId, "",
            drive.ManifestCreatedAt, drive.ManifestUpdatedAt);
        DriveFilePath.TryCreate(DriveManifest.Path, out var path);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Hyper.BeforeProtocolWrite = async _ =>
        {
            entered.SetResult();
            await release.Task;
        };
        var delayed = fixture.Hyper.WriteProtocolFileAsync(key, path, outdated.Serialize(),
            original.ETag, CancellationToken.None);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        fixture.Hyper.BeforeProtocolWrite = null;
        try
        {
            // 固定时钟下恢复原值，完整公开文档与旧远端文档相同，但本地修订已不同。
            await fixture.Description.UpdateAsync(id, new("电影收藏", "", 2), CancellationToken.None);
            await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        }
        finally
        {
            release.SetResult();
        }
        Assert.Equal(HyperWriteProtocolFileResultCode.Conflict, (await delayed).ResultCode);
        Assert.Equal("电影收藏", DriveManifest.Parse(fixture.Hyper.GetProtocolFile(key).Content!).Manifest!.Name);
        Assert.Equal(3, (await fixture.Db.Drives.SingleAsync()).ManifestSyncedRevision);
    }

    [Fact]
    public async Task UnknownRemoteFieldsArePreservedByRefusingReplacement()
    {
        await using var fixture = await Fixture.CreateAsync();
        await fixture.CreateDriveAsync();
        var drive = await fixture.Db.Drives.SingleAsync();
        var original = new DriveManifest(1, drive.Name, drive.ContentTypeId, "",
            drive.ManifestCreatedAt, drive.ManifestUpdatedAt).Serialize();
        var json = Encoding.UTF8.GetString(original);
        var extended = Encoding.UTF8.GetBytes(json[..^1] + ",\"publisherId\":\"future-identity\"}");
        fixture.Hyper.SetProtocolFile(Key(drive), extended);
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        Assert.Empty(fixture.Hyper.WriteProtocolFileCalls);
        Assert.Equal(extended, fixture.Hyper.GetProtocolFile(Key(drive)).Content);
        Assert.Equal("manifest_unknown_fields", (await fixture.Db.Drives.SingleAsync()).ManifestErrorCode);
    }

    [Fact]
    public async Task ConditionalConflictRetriesLatestLocalDescription()
    {
        await using var fixture = await Fixture.CreateAsync();
        var id = await fixture.CreateDriveAsync();
        fixture.Hyper.WriteProtocolFileResult = new(HyperWriteProtocolFileResultCode.Conflict);
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        Assert.Equal("manifest_conflict", (await fixture.Db.Drives.SingleAsync()).ManifestErrorCode);

        var update = await fixture.Description.UpdateAsync(id,
            new("新版本", "新描述", 1), CancellationToken.None);
        Assert.Equal(UpdateDriveDescriptionResultCode.Accepted, update.ResultCode);
        fixture.Hyper.WriteProtocolFileResult = null;
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        var saved = await fixture.Db.Drives.SingleAsync();
        Assert.Equal(2, saved.ManifestSyncedRevision);
        Assert.Equal("新版本", DriveManifest.Parse(fixture.Hyper.GetProtocolFile(Key(saved)).Content!).Manifest!.Name);
    }

    [Fact]
    public async Task DeletedDriveDoesNotDispatchPendingManifest()
    {
        await using var fixture = await Fixture.CreateAsync();
        var id = await fixture.CreateDriveAsync();
        await fixture.Drives.DeleteAsync(id, CancellationToken.None);
        await fixture.Sync.ProcessPendingAsync(CancellationToken.None);
        Assert.Empty(fixture.Hyper.ReadProtocolFileCalls);
        Assert.Empty(fixture.Hyper.WriteProtocolFileCalls);
    }

    [Fact]
    public async Task CancellationLeavesDurableIntentWithoutRecordingProtocolFailure()
    {
        await using var fixture = await Fixture.CreateAsync();
        await fixture.CreateDriveAsync();
        using var cancellation = new CancellationTokenSource();
        fixture.Hyper.BeforeProtocolWrite = token =>
        {
            cancellation.Cancel();
            token.ThrowIfCancellationRequested();
            return Task.CompletedTask;
        };
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            fixture.Sync.ProcessPendingAsync(cancellation.Token));
        fixture.Db.ChangeTracker.Clear();
        var saved = await fixture.Db.Drives.SingleAsync();
        Assert.Equal(0, saved.ManifestSyncedRevision);
        Assert.Null(saved.ManifestErrorCode);
    }

    private static DriveKey Key(DriveEntity drive)
    {
        Assert.True(DriveKey.TryCreate(drive.Key, out var key));
        return key;
    }

    private sealed class ManualClock : TimeProvider
    {
        private DateTimeOffset now = new(2026, 9, 5, 8, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        internal void Advance(TimeSpan elapsed) => now += elapsed;
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private readonly SqliteConnection connection = new("Data Source=:memory:");
        private readonly DriveCreationLock creationLock = new();
        internal CinereelDbContext Db { get; private set; } = null!;
        internal TestHyperClient Hyper { get; } = new();
        internal ManualClock Clock { get; } = new();
        internal DriveService Drives { get; private set; } = null!;
        internal DriveDescriptionService Description { get; private set; } = null!;
        internal DriveManifestSyncService Sync { get; private set; } = null!;

        internal static async Task<Fixture> CreateAsync()
        {
            var fixture = new Fixture();
            await fixture.connection.OpenAsync();
            fixture.Db = fixture.NewContext();
            await fixture.Db.Database.EnsureCreatedAsync();
            var repository = new DriveRepository(fixture.Db);
            var unitOfWork = new UnitOfWork(fixture.Db);
            fixture.Drives = new(repository, unitOfWork, fixture.Hyper, fixture.creationLock,
                fixture.Clock, NullLogger<DriveService>.Instance);
            fixture.Description = new(repository, unitOfWork, fixture.creationLock, fixture.Clock);
            fixture.Sync = fixture.NewSync(fixture.Db);
            return fixture;
        }

        internal CinereelDbContext NewContext() => new(new DbContextOptionsBuilder<CinereelDbContext>()
            .UseSqlite(connection).Options);

        internal DriveManifestSyncService NewSync(CinereelDbContext db) => new(
            new DriveRepository(db), new UnitOfWork(db), new DriveManifestService(Hyper),
            creationLock, Clock, NullLogger<DriveManifestSyncService>.Instance);

        internal async Task<DriveId> CreateDriveAsync()
        {
            IdempotencyKey.TryCreate("manifest:test", out var key);
            var result = await Drives.CreateAsync(key, new("电影收藏", "cinereel.movie"), CancellationToken.None);
            await Drives.ProcessPendingCreationsAsync(CancellationToken.None);
            return new(result.Drive!.DriveId);
        }

        public async ValueTask DisposeAsync()
        {
            await Db.DisposeAsync();
            await connection.DisposeAsync();
        }
    }
}
