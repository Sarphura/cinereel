using CineReel.Service.Features.Metadata;
using CineReel.Service.Infrastructure.HyperAgent;
using Microsoft.Extensions.Logging;

namespace CineReel.Service.Features.Trailers;

public interface ITrailerCache
{
    Task<byte[]?> LookupAsync(string id, CancellationToken cancellationToken = default);
    Task<bool> StoreAsync(string id, string driveKey, CancellationToken cancellationToken = default);
    Task EvictUntilBelowFloorAsync(CancellationToken cancellationToken = default);
    long CurrentSizeBytes { get; }
}

public sealed class TrailerCache : ITrailerCache
{
    private readonly ITrailerFileSystem _fs;
    private readonly IHyperAgentReadClient _reader;
    private readonly TrailerCacheOptions _options;
    private readonly ILogger<TrailerCache> _logger;
    private readonly TimeProvider _clock;
    private readonly object _gate = new();

    public TrailerCache(ITrailerFileSystem fs, IHyperAgentReadClient reader, TrailerCacheOptions options, ILogger<TrailerCache> logger, TimeProvider? clock = null)
    {
        _fs = fs;
        _reader = reader ?? throw new ArgumentNullException(nameof(reader));
        _options = options;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
    }

    public long CurrentSizeBytes
    {
        get
        {
            lock (_gate)
            {
                long total = 0;
                foreach (var path in _fs.EnumerateFiles(_options.CacheRoot)) total += _fs.Size(path);
                return total;
            }
        }
    }

    private string PathFor(string id) => Path.Combine(_options.CacheRoot, $"{Sanitize(id)}.mp4");

    public Task<byte[]?> LookupAsync(string id, CancellationToken cancellationToken = default)
    {
        var path = PathFor(id);
        if (!_fs.Exists(path)) return Task.FromResult<byte[]?>(null);
        try
        {
            var bytes = _fs.ReadAllBytes(path);
            _fs.Touch(path, _clock.GetUtcNow());
            return Task.FromResult<byte[]?>(bytes);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "trailer cache read failed for {Id}", id);
            try { _fs.Delete(path); } catch { }
            return Task.FromResult<byte[]?>(null);
        }
    }

    public async Task<bool> StoreAsync(string id, string driveKey, CancellationToken cancellationToken = default)
    {
        var path = PathFor(id);
        try
        {
            var resp = await _reader.ReadFileAsync(driveKey, "trailer.mp4", cancellationToken: cancellationToken);
            return await TryStoreAsync(id, path, resp, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "trailer fetch failed for {Id}", id);
            return false;
        }
    }

    private async Task<bool> TryStoreAsync(string id, string path, HyperAgentFileResponse resp, CancellationToken cancellationToken)
    {
        if (_fs.Exists(path) && resp.ContentLength.HasValue && _fs.Size(path) != resp.ContentLength.Value)
        {
            _fs.Delete(path);
            return false;
        }

        try
        {
            if (_fs.TryGetFreeBytes(_options.CacheRoot, out var free) && free < resp.Body.Length + 16 * 1024 * 1024)
            {
                _logger.LogWarning("disk full; falling back to stream-from-agent for {Id}", id);
                return false;
            }
            _fs.WriteAllBytes(path, resp.Body);
            _fs.Touch(path, _clock.GetUtcNow());
            return true;
        }
        catch (IOException ex)
        {
            _logger.LogWarning(ex, "trailer write failed (disk full?) for {Id}", id);
            return false;
        }
    }

    public Task EvictUntilBelowFloorAsync(CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            var files = _fs.EnumerateFiles(_options.CacheRoot)
                .Select(p => new { Path = p, Size = _fs.Size(p), Accessed = _fs.LastAccessUtc(p) })
                .OrderBy(f => f.Accessed)
                .ToList();
            long total = files.Sum(f => f.Size);
            if (total <= _options.MaxBytes) return Task.CompletedTask;
            foreach (var file in files)
            {
                if (total <= _options.EvictUntilBytes) break;
                _fs.Delete(file.Path);
                total -= file.Size;
            }
        }
        return Task.CompletedTask;
    }

    private static string Sanitize(string id) => id.Replace('/', '_').Replace('\\', '_').Replace(":", "_").Replace(" ", "_");
}