# Jellyfin push uses per-Media-Item async locks keyed by IMDb or local ID

The `JellyfinPusher` uses a per-Media-Item async lock (a `SemaphoreSlim` keyed by IMDb ID or synthetic local ID) to serialise all writes to a single Jellyfin library folder. Concurrent pushes to *different* folders proceed in parallel.

## Context

A Media Item's Jellyfin library folder is touched by multiple async paths:

- Initial push (poster, NFO) when the item is first scanned.
- Video-file write when the BT download completes.
- Trailer write when the trailer is fetched from Hyperdrive.
- Re-push when the source drive's NFO changes.
- Removal when the subscription is cancelled.

These paths can fire concurrently for the same Media Item. Without coordination, partial writes (e.g. poster written but NFO missing) leave Jellyfin's scanner in a confused state. We want concurrency within an item to be ordered, but concurrency across items to remain high.

## Decision

### Lock implementation

```csharp
namespace Cinereel.Infrastructure.Concurrency;

public sealed class AsyncKeyedLock<TKey> where TKey : notnull
{
    private readonly Dictionary<TKey, SemaphoreSlim> _locks = new();
    private readonly Func<TKey, SemaphoreSlim> _factory;

    public AsyncKeyedLock(Func<TKey, SemaphoreSlim> factory) { _factory = factory; }

    public async Task<IDisposable> AcquireAsync(TKey key, CancellationToken ct)
    {
        var sem = _locks.GetOrAdd(key, _factory);
        await sem.WaitAsync(ct).ConfigureAwait(false);
        return new Releaser(sem);
    }

    private sealed class Releaser : IDisposable
    {
        private readonly SemaphoreSlim _sem;
        private int _disposed;
        public Releaser(SemaphoreSlim sem) { _sem = sem; }
        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 0) _sem.Release();
        }
    }
}
```

### Lock key

The key is the canonical Jellyfin folder name suffix: `imdb-<id>` if an IMDb ID exists, otherwise `local-<16hex>` (per ADR 0007 and ADR 0016).

### Usage in JellyfinPusher

```csharp
private readonly AsyncKeyedLock<string> _folderLocks;

public async Task PushAsync(MediaItem item, CancellationToken ct)
{
    var key = item.ImdbId?.ToString() ?? item.LocalId.ToString();
    using var _ = await _folderLocks.AcquireAsync(key, ct);
    // ... perform the actual file writes ...
}
```

### Concurrency limits

- Per-item: serial (1 in-flight push at a time)
- Cross-item: unbounded; multiple Media Items push in parallel via the thread pool

### Failure semantics

If a push fails inside the lock, the lock is released and the failure is propagated to the calling event handler. The next retry acquires the lock fresh. There's no "stuck lock" hazard because we use `SemaphoreSlim` (not a process-wide mutex).

### Lifecycle

Locks are kept in a `ConcurrentDictionary` for the lifetime of the App Server. Memory growth is bounded by the number of Media Items, which is bounded by what the user subscribes to (likely < 10k).

## Trade-off accepted

- Locks held across async file I/O can starve other handlers if a write is slow (e.g. writing a 50GB video). For V1, pushes typically write small files (poster, NFO) and the BT-staged video file is written in a separate code path that holds the lock briefly while the file is moved/linked into place. Acceptable.
- The lock key for items that change IMDb ID (synthetic → real per ADR 0016) changes too, which means a folder rename happens without holding the original lock. We accept this — the rename is an atomic file system operation.