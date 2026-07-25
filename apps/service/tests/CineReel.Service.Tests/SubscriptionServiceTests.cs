using CineReel.Service.Data.Entities;
using CineReel.Service.Domain.Common;
using CineReel.Service.Events;
using CineReel.Service.Features.Subscription;
using CineReel.Service.Features.Subscription.Dto;
using CineReel.Service.Features.Subscription.Events;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class SubscriptionServiceTests
{
    private const string Key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private const string OtherKey = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    [Fact]
    public async Task CreateFromDriveKeyAsync_persists_pending_row_and_emits_event()
    {
        var repo = new InMemorySubscriptionRepository();
        var writer = new StubHyperAgentWriteClient(mountResponse: new MountResponse(Key));
        var reader = new StubHyperAgentReadClient();
        var bus = new RecordingBus();
        var service = NewService(repo, writer, reader, bus);

        var sub = await service.CreateFromDriveKeyAsync(Key, alias: "Self");

        Assert.Equal(Key, sub.DriveKey);
        Assert.Equal(SubscriptionState.Pending, sub.State);
        Assert.Contains(repo.All(), s => s.DriveKey == Key);
        Assert.NotNull(bus.LastCreated);
        Assert.Equal(Key, bus.LastCreated!.DriveKey.Value);
    }

    [Fact]
    public async Task CreateFromDriveKeyAsync_rejects_malformed_key_with_400()
    {
        var service = NewService(new InMemorySubscriptionRepository(), new StubHyperAgentWriteClient(), new StubHyperAgentReadClient(), new RecordingBus());

        var ex = await Assert.ThrowsAsync<SubscriptionServiceException>(() =>
            service.CreateFromDriveKeyAsync("not-a-key", alias: null));
        Assert.Equal(SubscriptionServiceException.InvalidDriveKey, ex.Code);
    }

    [Fact]
    public async Task CreateFromDriveKeyAsync_rejects_duplicates_with_409()
    {
        var repo = new InMemorySubscriptionRepository();
        await repo.AddAsync(new SubscriptionEntity { DriveKey = Key, State = SubscriptionState.Active, SubscribedAt = DateTimeOffset.UtcNow });
        var service = NewService(repo, new StubHyperAgentWriteClient(mountResponse: new MountResponse(Key)), new StubHyperAgentReadClient(), new RecordingBus());

        var ex = await Assert.ThrowsAsync<SubscriptionServiceException>(() =>
            service.CreateFromDriveKeyAsync(Key, alias: null));
        Assert.Equal(SubscriptionServiceException.Duplicate, ex.Code);
    }

    [Fact]
    public async Task CreateFromDriveKeyAsync_maps_drive_not_mounted_to_404()
    {
        var writer = new StubHyperAgentWriteClient { ThrowDriveNotMountedOnMount = true };
        var service = NewService(new InMemorySubscriptionRepository(), writer, new StubHyperAgentReadClient(), new RecordingBus());

        var ex = await Assert.ThrowsAsync<SubscriptionServiceException>(() =>
            service.CreateFromDriveKeyAsync(Key, alias: null));
        Assert.Equal(SubscriptionServiceException.DriveNotMounted, ex.Code);
    }

    [Fact]
    public async Task Delete_unmounts_and_emits_deleted_event()
    {
        var repo = new InMemorySubscriptionRepository();
        var bus = new RecordingBus();
        var writer = new StubHyperAgentWriteClient();
        var service = NewService(repo, writer, new StubHyperAgentReadClient(), bus);

        var sub = await service.CreateFromDriveKeyAsync(Key, alias: null);
        var deleted = await service.DeleteAsync(new SubscriptionId(sub.Id));

        Assert.True(deleted);
        Assert.Empty(repo.All());
        Assert.NotNull(bus.LastDeleted);
        writer.AssertUnmountInvoked();
    }

    [Fact]
    public async Task MarkActive_sets_state_and_timestamp()
    {
        var repo = new InMemorySubscriptionRepository();
        var bus = new RecordingBus();
        var service = NewService(repo, new StubHyperAgentWriteClient(), new StubHyperAgentReadClient(), bus);

        var sub = await service.CreateFromDriveKeyAsync(Key, alias: null);
        await service.MarkActiveAsync(new SubscriptionId(sub.Id));

        var row = repo.All().Single();
        Assert.Equal(SubscriptionState.Active, row.State);
        Assert.NotNull(row.LastDescriptorSeenAt);
    }

    [Fact]
    public async Task MarkFailed_records_reason()
    {
        var repo = new InMemorySubscriptionRepository();
        var bus = new RecordingBus();
        var service = NewService(repo, new StubHyperAgentWriteClient(), new StubHyperAgentReadClient(), bus);

        var sub = await service.CreateFromDriveKeyAsync(Key, alias: null);
        await service.MarkFailedAsync(new SubscriptionId(sub.Id), "boom");

        var row = repo.All().Single();
        Assert.Equal(SubscriptionState.Failed, row.State);
        Assert.Equal("boom", row.FailureReason);
    }

    [Fact]
    public async Task ToResponse_includes_is_self_flag_from_main_drive()
    {
        var repo = new InMemorySubscriptionRepository();
        var bus = new RecordingBus();
        Func<DriveKey, bool> mainDrive = key => key.Value == Key;
        var service = NewService(repo, new StubHyperAgentWriteClient(), new StubHyperAgentReadClient(), bus, isSelf: false);
        // Override the isSelf closure manually (NewService defaulted to always false)
        var field = typeof(SubscriptionService).GetField("_isSelfDriveKey", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
        // Reflection trick to swap — easier: replace service with a direct ctor using `mainDrive`.
        var service2 = new SubscriptionService(repo, new StubServiceProvider(new StubHyperAgentWriteClient(), new StubHyperAgentReadClient()), bus, mainDrive, NullLogger<SubscriptionService>.Instance);

        var sub = await service2.CreateFromDriveKeyAsync(Key, alias: null);
        var response = await service2.ToResponseAsync(sub);
        Assert.True(response.IsSelf);

        var other = await service2.CreateFromDriveKeyAsync(OtherKey, alias: null);
        var otherResponse = await service2.ToResponseAsync(other);
        Assert.False(otherResponse.IsSelf);
    }

    private static SubscriptionService NewService(
        InMemorySubscriptionRepository repo,
        StubHyperAgentWriteClient writer,
        StubHyperAgentReadClient reader,
        RecordingBus bus,
        bool isSelf = false)
    {
        Func<DriveKey, bool> isSelfFn = _ => isSelf;
        return new SubscriptionService(repo, new StubServiceProvider(writer, reader), bus, isSelfFn, NullLogger<SubscriptionService>.Instance);
    }
}

internal sealed class StubServiceProvider : IServiceProvider
{
    private readonly StubHyperAgentWriteClient _writer;
    private readonly StubHyperAgentReadClient _reader;

    public StubServiceProvider(StubHyperAgentWriteClient writer, StubHyperAgentReadClient reader)
    {
        _writer = writer;
        _reader = reader;
    }

    public object? GetService(Type serviceType)
    {
        if (serviceType == typeof(IHyperAgentWriteClient)) return _writer;
        if (serviceType == typeof(IHyperAgentReadClient)) return _reader;
        return null;
    }
}

internal sealed class StubHyperAgentWriteClient : IHyperAgentWriteClient
{
    private readonly MountResponse _mountResponse;
    private readonly UnmountResponse _unmountResponse = new(true);
    private int _unmountInvocations;

    public bool ThrowDriveNotMountedOnMount { get; set; }

    public StubHyperAgentWriteClient(MountResponse? mountResponse = null)
    {
        _mountResponse = mountResponse ?? new MountResponse("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    }

    public void AssertUnmountInvoked() => Assert.True(_unmountInvocations > 0);

    public Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
    public Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
    public Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
    public Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default)
    {
        if (ThrowDriveNotMountedOnMount)
        {
            throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 404, "not mounted");
        }
        return Task.FromResult(new MountResponse(publicKey));
    }
    public Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default)
    {
        _unmountInvocations++;
        return Task.FromResult(_unmountResponse);
    }
    public Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
}

internal sealed class StubHyperAgentReadClient : IHyperAgentReadClient
{
    public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
    public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(new HyperAgentVersionResponse("test", "0.0.0"));
    public Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
    public Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) =>
        Task.FromResult<HyperdriveEntry?>(null);
    public Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
    public Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
    public Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
    public Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
}

internal sealed class RecordingBus : IDomainEventBus
{
    public SubscriptionCreated? LastCreated { get; private set; }
    public SubscriptionDeleted? LastDeleted { get; private set; }

    public Task PublishAsync<TEvent>(TEvent evt, CancellationToken cancellationToken = default)
        where TEvent : IDomainEvent
    {
        switch (evt)
        {
            case SubscriptionCreated created:
                LastCreated = created;
                break;
            case SubscriptionDeleted deleted:
                LastDeleted = deleted;
                break;
        }
        return Task.CompletedTask;
    }
}

internal static class InMemoryRepositoryExtensions
{
    public static IReadOnlyList<SubscriptionEntity> All(this InMemorySubscriptionRepository repo)
    {
        var dict = (System.Collections.IDictionary)typeof(InMemorySubscriptionRepository)
            .GetField("_items", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .GetValue(repo)!;
        var result = new List<SubscriptionEntity>();
        foreach (var value in dict.Values)
        {
            result.Add((SubscriptionEntity)value);
        }
        return result;
    }
}
