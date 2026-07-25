using System.Text;
using System.Text.Json;
using CineReel.Service.Events;
using CineReel.Service.Features.Profile;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class ProfileServiceTests
{
    private const string MainDriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public async Task Get_reads_profile_and_collections()
    {
        var reader = new ProfileStubReader();
        reader.Files["/profile.json"] = """{"name":"Main","bio":"hi","avatarPath":"/avatar.png","updatedAt":"2026-01-01T00:00:00Z"}""";
        reader.Drives.Add(new DriveDescriptor("resource-key", "My Resource", "resource", true, DateTimeOffset.UtcNow));
        reader.FilesForDrive["resource-key"] = new() { ["/descriptor.json"] = """{"name":"My Resource","type":"resource","createdAt":"2026-01-01T00:00:00Z"}""" };
        var service = new ProfileService(reader, new ProfileStubWriter(), new SimpleBus(), NullLogger<ProfileService>.Instance);

        var dto = await service.GetAsync(MainDriveKey);

        Assert.Equal("Main", dto.Name);
        Assert.Equal("hi", dto.Bio);
        Assert.Equal("/avatar.png", dto.AvatarPath);
        Assert.Single(dto.Collections);
    }

    [Fact]
    public async Task Update_writes_profile_and_publishes_event()
    {
        var reader = new ProfileStubReader();
        var writer = new ProfileStubWriter();
        var bus = new SimpleBus();
        var service = new ProfileService(reader, writer, bus, NullLogger<ProfileService>.Instance);

        await service.UpdateAsync(MainDriveKey, new ProfileUpdateRequest("New", "Hello"));

        Assert.Contains(writer.Writes, w => w.Path == "/profile.json");
        Assert.Single(bus.Published);
        Assert.IsType<ProfileUpdated>(bus.Published[0]);
    }
}

internal sealed class ProfileStubReader : IHyperAgentReadClient
{
    public const string MainDriveKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    public Dictionary<string, string> Files { get; } = new();
    public Dictionary<string, Dictionary<string, string>> FilesForDrive { get; } = new();
    public List<DriveDescriptor> Drives { get; } = new();

    public Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default)
    {
        if (driveKey == MainDriveKey && Files.TryGetValue(path, out var content))
            return Task.FromResult(new HyperAgentFileResponse(System.Net.HttpStatusCode.OK, "application/json", content.Length, null, Encoding.UTF8.GetBytes(content)));
        if (FilesForDrive.TryGetValue(driveKey, out var per) && per.TryGetValue(path, out var c))
            return Task.FromResult(new HyperAgentFileResponse(System.Net.HttpStatusCode.OK, "application/json", c.Length, null, Encoding.UTF8.GetBytes(c)));
        throw new HyperAgentDriveNotMountedException(new Uri("about:blank"), 404, "not-found");
    }
    public Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<DriveDescriptor>>(Drives);
    public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) => Task.FromResult<HyperdriveEntry?>(null);
    public Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
}

internal sealed class ProfileStubWriter : IHyperAgentWriteClient
{
    public List<(string Path, byte[] Body)> Writes { get; } = new();
    public int Announces { get; private set; }
    public Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default)
    {
        Writes.Add((path, body));
        return Task.FromResult(new FileWriteResponse(true, body.Length));
    }
    public Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) { Announces++; return Task.FromResult(new AnnounceResponse(true)); }
    public Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) => throw new NotSupportedException();
}

internal sealed class SimpleBus : IDomainEventBus
{
    public List<IDomainEvent> Published { get; } = new();
    public Task PublishAsync<TEvent>(TEvent evt, CancellationToken cancellationToken = default) where TEvent : IDomainEvent
    {
        Published.Add(evt);
        return Task.CompletedTask;
    }
}