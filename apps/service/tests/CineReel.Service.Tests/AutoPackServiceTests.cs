using CineReel.Service.Features.Publish;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class AutoPackServiceTests
{
    [Fact]
    public async Task Pack_writes_files_and_returns_drivekey()
    {
        var tmpVideo = Path.Combine(Path.GetTempPath(), $"cinereel-pack-{Guid.NewGuid():N}.mp4");
        await File.WriteAllBytesAsync(tmpVideo, new byte[64]);
        var tmpPoster = Path.Combine(Path.GetTempPath(), $"cinereel-pack-{Guid.NewGuid():N}.jpg");
        await File.WriteAllBytesAsync(tmpPoster, new byte[8]);
        try
        {
            var writer = new SpyHyperAgentWriter();
            var services = new StubPackProvider(writer);
            var factory = new FileSystemTorrentFactory();
            var service = new AutoPackService(factory, services, NullLogger<AutoPackService>.Instance);

            var response = await service.PackAsync(new AutoPackRequest(tmpVideo, "test-drive", "Test", 2024, "tt0000001", tmpPoster));

            Assert.False(string.IsNullOrEmpty(response.DriveKey));
            Assert.False(string.IsNullOrEmpty(response.Infohash));
            Assert.True(writer.Writes.Count >= 4);
        }
        finally
        {
            try { File.Delete(tmpVideo); File.Delete(tmpPoster); } catch { /* ignore */ }
        }
    }

    [Fact]
    public async Task Missing_local_file_throws_validation()
    {
        var services = new StubPackProvider(new SpyHyperAgentWriter());
        var service = new AutoPackService(new FileSystemTorrentFactory(), services, NullLogger<AutoPackService>.Instance);

        await Assert.ThrowsAsync<AutoPackValidationException>(() =>
            service.PackAsync(new AutoPackRequest("/nonexistent.mp4", "x", "T", 2024, null, null)));
    }
}

internal sealed class SpyHyperAgentWriter : IHyperAgentWriteClient
{
    public List<(string Path, byte[] Body)> Writes { get; } = new();
    public List<string> Deletes { get; } = new();

    public Task<CreateDriveResponse> CreateDriveAsync(string name, string type, CancellationToken cancellationToken = default) =>
        Task.FromResult(new CreateDriveResponse("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", name, type, true, DateTimeOffset.UtcNow));
    public Task<FileWriteResponse> WriteFileAsync(string driveKey, string path, byte[] body, object? metadata = null, CancellationToken cancellationToken = default)
    {
        Writes.Add((path, body));
        return Task.FromResult(new FileWriteResponse(true, body.Length));
    }
    public Task<DeleteResponse> DeleteFileAsync(string driveKey, string path, bool recursive = false, CancellationToken cancellationToken = default)
    {
        Deletes.Add(path);
        return Task.FromResult(new DeleteResponse(true));
    }
    public Task<MountResponse> MountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) => Task.FromResult(new MountResponse(publicKey));
    public Task<UnmountResponse> UnmountRemoteDriveAsync(string publicKey, CancellationToken cancellationToken = default) => Task.FromResult(new UnmountResponse(true));
    public Task<AnnounceResponse> AnnounceAsync(bool wait = true, CancellationToken cancellationToken = default) => Task.FromResult(new AnnounceResponse(true));
}

internal sealed class StubPackProvider : IServiceProvider
{
    private readonly IHyperAgentWriteClient _writer;
    public StubPackProvider(IHyperAgentWriteClient writer) { _writer = writer; }
    public object? GetService(Type serviceType) => serviceType == typeof(IHyperAgentWriteClient) ? _writer : null;
}