using CineReel.Service.Features.Bt;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class ThrottlingStreamTests
{
    [Fact]
    public async Task Read_throttles_to_byte_budget()
    {
        // 10 KB/s budget. Inner returns 5 KB per read.
        var inner = new BurstStream(5 * 1024);
        using var stream = new ThrottlingDuplexStream(inner, 10 * 1024);

        var buf = new byte[5 * 1024];
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var total = 0;
        // Read 30 KB → with a 10 KB/s cap, we expect ~2 s.
        for (int i = 0; i < 6; i++)
        {
            total += await stream.ReadAsync(buf);
        }
        sw.Stop();
        Assert.Equal(30 * 1024, total);
        Assert.True(sw.ElapsedMilliseconds >= 800, $"expected throttle delay, got {sw.ElapsedMilliseconds}ms");
    }
}

internal sealed class BurstStream : Stream
{
    private readonly int _chunkSize;
    private int _position;
    public BurstStream(int chunkSize) { _chunkSize = chunkSize; }
    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => long.MaxValue;
    public override long Position { get => _position; set => _position = (int)value; }
    public override void Flush() { }
    public override int Read(byte[] buffer, int offset, int count)
    {
        var n = Math.Min(count, _chunkSize);
        Array.Fill<byte>(buffer, 0, offset, n);
        _position += n;
        return n;
    }
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        await Task.Yield();
        var n = Math.Min(buffer.Length, _chunkSize);
        buffer.Span.Slice(0, n).Fill(0);
        _position += n;
        return n;
    }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}