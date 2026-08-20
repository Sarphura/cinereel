using System.Collections.Generic;

namespace Cinereel.Features.Drive;

internal sealed class DriveCreationLock
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    internal async ValueTask<IDisposable> AcquireAsync(
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        Entry entry;

        lock (_gate)
        {
            if (!_entries.TryGetValue(idempotencyKey, out entry!))
            {
                entry = new Entry();
                _entries.Add(idempotencyKey, entry);
            }

            entry.ReferenceCount++;
        }

        try
        {
            await entry.Semaphore.WaitAsync(cancellationToken);
            return new Releaser(this, idempotencyKey, entry);
        }
        catch
        {
            ReleaseReference(idempotencyKey, entry);
            throw;
        }
    }

    private void Release(string idempotencyKey, Entry entry)
    {
        entry.Semaphore.Release();
        ReleaseReference(idempotencyKey, entry);
    }

    private void ReleaseReference(string idempotencyKey, Entry entry)
    {
        lock (_gate)
        {
            entry.ReferenceCount--;

            if (entry.ReferenceCount == 0)
            {
                _entries.Remove(idempotencyKey);
                entry.Semaphore.Dispose();
            }
        }
    }

    private sealed class Entry
    {
        internal SemaphoreSlim Semaphore { get; } = new(1, 1);

        internal int ReferenceCount { get; set; }
    }

    private sealed class Releaser(
        DriveCreationLock owner,
        string idempotencyKey,
        Entry entry) : IDisposable
    {
        private bool _disposed;

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            owner.Release(idempotencyKey, entry);
        }
    }
}
