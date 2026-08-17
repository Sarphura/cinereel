using System.Collections.Concurrent;

namespace CineReel.Service.Features.Jellyfin;

/// <summary>
/// Per-key async lock. Pushes to different folders run in
/// parallel; pushes to the same folder serialise. The lock is keyed
/// by an opaque string (typically the IMDb or local ID).
/// </summary>
public sealed class AsyncKeyedLock
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);

    public async Task<T> RunAsync<T>(string key, Func<CancellationToken, Task<T>> body, CancellationToken cancellationToken = default)
    {
        var gate = _locks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            return await body(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            gate.Release();
        }
    }

    public Task RunAsync(string key, Func<CancellationToken, Task> body, CancellationToken cancellationToken = default) =>
        RunAsync(key, async ct => { await body(ct).ConfigureAwait(false); return 0; }, cancellationToken);
}