using System.Text;
using CineReel.Service.Features.Trailers;
using CineReel.Service.Infrastructure.HyperAgent;
using CineReel.Service.Infrastructure.HyperAgent.Generated;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class TrailerCacheTests
{
    private static readonly TimeProvider FixedClock = new FixedTimeProvider();

    [Fact]
    public async Task Lookup_returns_null_on_cache_miss()
    {
        var fs = new InMemoryTrailerFileSystem();
        var cache = NewCache(fs);

        var result = await cache.LookupAsync("tt0000001");

        Assert.Null(result);
    }

    [Fact]
    public async Task Store_then_lookup_returns_cached_bytes()
    {
        var fs = new InMemoryTrailerFileSystem();
        var reader = new StubTrailerReader(body: "TRAILER-BYTES"u8.ToArray());
        var cache = NewCache(fs, reader);

        var stored = await cache.StoreAsync("tt0000001", "drive-key");
        var read = await cache.LookupAsync("tt0000001");

        Assert.True(stored);
        Assert.Equal("TRAILER-BYTES", Encoding.UTF8.GetString(read!));
    }

    [Fact]
    public async Task Eviction_caps_total_at_floor()
    {
        var fs = new InMemoryTrailerFileSystem();
        var cache = NewCache(fs, options: new TrailerCacheOptions
        {
            CacheRoot = "/cache",
            MaxBytes = 900,
            EvictUntilBytes = 600,
        });

        // Seed 5 files of 200 bytes each.
        for (int i = 0; i < 5; i++)
        {
            var path = $"/cache/id{i}.mp4";
            fs.WriteAllBytes(path, new byte[200]);
            fs.Touch(path, FixedClock.GetUtcNow().AddSeconds(-i));
        }

        Assert.Equal(1000, cache.CurrentSizeBytes);

        await cache.EvictUntilBelowFloorAsync();

        Assert.True(cache.CurrentSizeBytes <= 600, $"size {cache.CurrentSizeBytes} > 600");
    }

    private static TrailerCache NewCache(InMemoryTrailerFileSystem fs, StubTrailerReader? reader = null, TrailerCacheOptions? options = null)
    {
        return new TrailerCache(fs, reader ?? new StubTrailerReader([]), options ?? new TrailerCacheOptions(), NullLogger<TrailerCache>.Instance, FixedClock);
    }
}

internal sealed class InMemoryTrailerFileSystem : ITrailerFileSystem
{
    private readonly Dictionary<string, byte[]> _files = new();
    private readonly Dictionary<string, DateTimeOffset> _accessTimes = new();
    private long _freeBytes = long.MaxValue;

    public bool DiskFull { get; set; }
    public void SetExists(string path, byte[] bytes, DateTimeOffset? accessedAt = null)
    {
        _files[path] = bytes;
        _accessTimes[path] = accessedAt ?? DateTimeOffset.UtcNow;
    }

    public bool Exists(string path) => _files.ContainsKey(path);
    public long Size(string path) => _files.TryGetValue(path, out var b) ? b.Length : 0;
    public DateTimeOffset LastAccessUtc(string path) => _accessTimes.GetValueOrDefault(path);
    public void Touch(string path, DateTimeOffset when) { _accessTimes[path] = when; }
    public byte[] ReadAllBytes(string path) => _files[path];
    public Stream OpenRead(string path) => new MemoryStream(_files[path]);
    public void WriteAllBytes(string path, byte[] bytes) { if (DiskFull) throw new IOException("disk full"); _files[path] = bytes; _accessTimes[path] = DateTimeOffset.UtcNow; }
    public void Delete(string path) { _files.Remove(path); _accessTimes.Remove(path); }
    public IEnumerable<string> EnumerateFiles(string folder) => _files.Keys.Where(p => p.StartsWith(folder));
    public bool TryGetFreeBytes(string folder, out long freeBytes)
    {
        freeBytes = _freeBytes;
        return true;
    }
}

internal sealed class StubTrailerReader : IHyperAgentReadClient
{
    private readonly byte[] _body;
    public StubTrailerReader(byte[] body) { _body = body; }
    public Task<HyperAgentFileResponse> ReadFileAsync(string driveKey, string path, long? rangeStart = null, long? rangeEnd = null, CancellationToken cancellationToken = default) =>
        Task.FromResult(new HyperAgentFileResponse(System.Net.HttpStatusCode.OK, "video/mp4", _body.Length, null, _body));
    public Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperAgentVersionResponse> GetVersionAsync(CancellationToken cancellationToken = default) => Task.FromResult(new HyperAgentVersionResponse("test", "0.0.0"));
    public Task<IReadOnlyList<DriveDescriptor>> ListDrivesAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<HyperdriveEntry?> GetEntryAsync(string driveKey, string path, bool wait = true, CancellationToken cancellationToken = default) => Task.FromResult<HyperdriveEntry?>(null);
    public Task<TreeNode> GetTreeAsync(string driveKey, string prefix = "/", bool wait = true, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IReadOnlyList<PeerInfo>> GetPeersAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public Task<IdentityInfo> GetIdentityAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
}

internal sealed class FixedTimeProvider : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
}