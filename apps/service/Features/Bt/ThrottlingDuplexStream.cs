namespace CineReel.Service.Features.Bt;

/// <summary>
/// Stream decorator that enforces a per-second byte budget on reads
/// and writes. The decorator is intentionally simple: it
/// keeps a sliding window of bytes per second and blocks the calling
/// thread on the next call when the budget is exceeded.
/// </summary>
public sealed class ThrottlingDuplexStream : Stream
{
    private readonly Stream _inner;
    private readonly long _bytesPerSecond;
    private long _windowStart;
    private long _windowBytes;

    public ThrottlingDuplexStream(Stream inner, long bytesPerSecond)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _bytesPerSecond = bytesPerSecond <= 0 ? long.MaxValue : bytesPerSecond;
    }

    public override bool CanRead => _inner.CanRead;
    public override bool CanSeek => _inner.CanSeek;
    public override bool CanWrite => _inner.CanWrite;
    public override long Length => _inner.Length;
    public override long Position { get => _inner.Position; set => _inner.Position = value; }
    public override void Flush() => _inner.Flush();
    public override Task FlushAsync(CancellationToken cancellationToken) => _inner.FlushAsync(cancellationToken);
    public override long Seek(long offset, SeekOrigin origin) => _inner.Seek(offset, origin);
    public override void SetLength(long value) => _inner.SetLength(value);

    public override int Read(byte[] buffer, int offset, int count)
    {
        Throttle(count);
        return _inner.Read(buffer, offset, count);
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        Throttle(buffer.Length);
        return await _inner.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        Throttle(count);
        _inner.Write(buffer, offset, count);
    }

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        Throttle(buffer.Length);
        await _inner.WriteAsync(buffer, cancellationToken).ConfigureAwait(false);
    }

    private void Throttle(int requested)
    {
        if (requested <= 0) return;
        var now = Environment.TickCount64;
        if (now - _windowStart >= 1000)
        {
            _windowStart = now;
            _windowBytes = 0;
        }
        _windowBytes += requested;
        if (_windowBytes <= _bytesPerSecond) return;
        var delay = (int)Math.Min(1000, (_windowBytes - _bytesPerSecond) * 1000 / _bytesPerSecond);
        Thread.Sleep(delay);
        _windowStart = Environment.TickCount64;
        _windowBytes = 0;
    }
}