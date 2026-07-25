using System.Text;
using CineReel.Service.Features.Publish;
using CineReel.Service.Features.Subscription;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class PublishServiceTests
{
    private const string MainDriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public async Task CreateDrive_writes_descriptor_and_subscription()
    {
        var subs = new InMemorySubscriptionRepository();
        var writer = new SpyPublishWriter();
        var services = new SpyPublishProvider(writer);
        var service = new PublishService(services, subs, NullLogger<PublishService>.Instance);

        var response = await service.CreateDriveAsync("My Drive", "metadata", MainDriveKey);

        Assert.False(string.IsNullOrEmpty(response.DriveKey));
        Assert.Contains(writer.Writes, w => w.Path == "descriptor.json");
        Assert.Single(await subs.ListAsync());
    }

    [Fact]
    public async Task CreateDrive_rejects_invalid_type()
    {
        var subs = new InMemorySubscriptionRepository();
        var services = new SpyPublishProvider(new SpyPublishWriter());
        var service = new PublishService(services, subs, NullLogger<PublishService>.Instance);

        await Assert.ThrowsAsync<PublishValidationException>(() => service.CreateDriveAsync("X", "weird-type", MainDriveKey));
    }

    [Fact]
    public async Task DeleteDrive_refuses_main_drive()
    {
        var subs = new InMemorySubscriptionRepository();
        var services = new SpyPublishProvider(new SpyPublishWriter());
        var service = new PublishService(services, subs, NullLogger<PublishService>.Instance);

        await Assert.ThrowsAsync<PublishConflictException>(() => service.DeleteDriveAsync(MainDriveKey, MainDriveKey));
    }

    [Fact]
    public async Task DeleteDrive_unmounts_and_removes_subscription()
    {
        var subs = new InMemorySubscriptionRepository();
        var otherKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde0";
        await subs.AddAsync(new Data.Entities.SubscriptionEntity { Id = 1, DriveKey = otherKey, State = Data.Entities.SubscriptionState.Active, SubscribedAt = DateTimeOffset.UtcNow });
        var writer = new SpyPublishWriter();
        var services = new SpyPublishProvider(writer);
        var service = new PublishService(services, subs, NullLogger<PublishService>.Instance);

        await service.DeleteDriveAsync(otherKey, MainDriveKey);

        Assert.Single(writer.Unmounts);
        Assert.Empty(await subs.ListAsync());
    }

    [Fact]
    public async Task Announce_forwards_to_writer()
    {
        var writer = new SpyPublishWriter();
        var services = new SpyPublishProvider(writer);
        var subs = new InMemorySubscriptionRepository();
        var service = new PublishService(services, subs, NullLogger<PublishService>.Instance);

        await service.AnnounceAsync("k", wait: true);

        Assert.Equal(1, writer.Announces);
    }
}

internal sealed class SpyPublishWriter : IHyperAgentWriteClient
{
    public List<(string Path, byte[] Body)> Writes { get; } = new();
    public List<string> Unmounts { get; } = new();
    public int Announces { get; private set; }
    public Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default) =>
        Task.FromResult(new CreateDriveResponse("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", name, type, true, DateTimeOffset.UtcNow));
    public Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default)
    {
        Writes.Add((path, body));
        return Task.FromResult(new FileWriteResponse(true, body.Length));
    }
    public Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default) => Task.FromResult(new DeleteResponse(true));
    public Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) => Task.FromResult(new MountResponse(publicKey));
    public Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default)
    {
        Unmounts.Add(publicKey);
        return Task.FromResult(new UnmountResponse(true));
    }
    public Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) { Announces++; return Task.FromResult(new AnnounceResponse(true)); }
}

internal sealed class SpyPublishProvider : IServiceProvider
{
    private readonly IHyperAgentWriteClient _writer;
    public SpyPublishProvider(IHyperAgentWriteClient writer) { _writer = writer; }
    public object? GetService(Type serviceType) => serviceType == typeof(IHyperAgentWriteClient) ? _writer : null;
    public IHyperAgentWriteClient GetWriter() => _writer;
}