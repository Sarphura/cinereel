using System.Net;
using System.Net.Http.Headers;
using Cinereel.Features.Drive;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class HyperProtocolClientTests
{
    [Fact]
    public async Task ReadEncodesProtocolPathAndReturnsBytesWithVersion()
    {
        Uri? requestUri = null;
        var client = CreateClient((request, _) =>
        {
            requestUri = request.RequestUri;
            Assert.Equal(HttpMethod.Get, request.Method);
            return Task.FromResult(ProtocolResponse([1, 2, 3]));
        });

        var result = await client.ReadProtocolFileAsync(CreateDriveKey(), CreatePath(), CancellationToken.None);

        Assert.Equal(HyperReadProtocolFileResultCode.Success, result.ResultCode);
        Assert.Equal(new byte[] { 1, 2, 3 }, result.Content);
        Assert.Equal("\"opaque-7\"", result.ETag);
        Assert.Equal(7, result.DriveVersion);
        Assert.Equal($"http://hyper-client/v1/protocol-files/{new string('a', 64)}" +
            "?path=%2F.cinereel%2Fdrive.json", requestUri?.AbsoluteUri);
    }

    [Theory]
    [InlineData("ETag", null)]
    [InlineData("ETag", "W/\"weak\"")]
    [InlineData("ETag", "*")]
    [InlineData("ETag", "invalid")]
    [InlineData("ETag", "\"one\", \"two\"")]
    [InlineData("X-Drive-Version", null)]
    [InlineData("X-Drive-Version", "-1")]
    [InlineData("X-Drive-Version", "1.0")]
    [InlineData("X-Drive-Version", "9223372036854775808")]
    public async Task RejectsInvalidVersionHeaders(string headerName, string? value)
    {
        var client = CreateClient((_, _) =>
        {
            var response = ProtocolResponse([1]);
            response.Headers.Remove(headerName);
            if (value is not null)
            {
                response.Headers.TryAddWithoutValidation(headerName, value);
            }

            return Task.FromResult(response);
        });

        await Assert.ThrowsAsync<HyperClientException>(() => client.ReadProtocolFileAsync(
            CreateDriveKey(), CreatePath(), CancellationToken.None));
    }

    [Fact]
    public async Task RejectsUnexpectedContentTypeAndTruncatedDeclaredLength()
    {
        var client = CreateClient((_, _) =>
        {
            var response = ProtocolResponse([1]);
            response.Content.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
            return Task.FromResult(response);
        });
        await Assert.ThrowsAsync<HyperClientException>(() => client.ReadProtocolFileAsync(
            CreateDriveKey(), CreatePath(), CancellationToken.None));

        client = CreateClient((_, _) =>
        {
            var response = ProtocolResponse([1]);
            response.Content.Headers.ContentLength = 2;
            return Task.FromResult(response);
        });
        await Assert.ThrowsAsync<HyperClientException>(() => client.ReadProtocolFileAsync(
            CreateDriveKey(), CreatePath(), CancellationToken.None));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task LimitsDeclaredAndStreamingBodySize(bool hasContentLength)
    {
        var client = CreateClient((_, _) =>
        {
            var bytes = new byte[65537];
            var response = ProtocolResponse(bytes);
            if (!hasContentLength)
            {
                response.Content = new StreamContent(new NonSeekableReadStream(bytes));
                response.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            }

            return Task.FromResult(response);
        });

        var result = await client.ReadProtocolFileAsync(CreateDriveKey(), CreatePath(), CancellationToken.None);
        Assert.Equal(HyperReadProtocolFileResultCode.TooLarge, result.ResultCode);
        Assert.Null(result.Content);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("\"opaque-before\"")]
    public async Task WriteUsesExclusiveCreateOrCompareAndSwapCondition(string? expectedETag)
    {
        var client = CreateClient(async (request, cancellationToken) =>
        {
            Assert.Equal(HttpMethod.Put, request.Method);
            Assert.Equal("application/octet-stream", request.Content?.Headers.ContentType?.MediaType);
            Assert.Equal(new byte[] { 1, 2, 3 }, await request.Content!.ReadAsByteArrayAsync(cancellationToken));
            if (expectedETag is null)
            {
                Assert.Equal("*", Assert.Single(request.Headers.IfNoneMatch).Tag);
                Assert.Empty(request.Headers.IfMatch);
            }
            else
            {
                Assert.Equal(expectedETag, Assert.Single(request.Headers.IfMatch).Tag);
                Assert.Empty(request.Headers.IfNoneMatch);
            }

            return ProtocolResponse([], expectedETag is null ? HttpStatusCode.Created : HttpStatusCode.OK);
        });

        var result = await client.WriteProtocolFileAsync(
            CreateDriveKey(), CreatePath(), new byte[] { 1, 2, 3 }, expectedETag, CancellationToken.None);

        Assert.Equal(HyperWriteProtocolFileResultCode.Written, result.ResultCode);
        Assert.Equal("\"opaque-7\"", result.ETag);
        Assert.Equal(7, result.DriveVersion);
    }

    [Theory]
    [InlineData(404, (int)HyperReadProtocolFileResultCode.NotFound)]
    [InlineData(409, (int)HyperReadProtocolFileResultCode.InvalidTarget)]
    [InlineData(413, (int)HyperReadProtocolFileResultCode.TooLarge)]
    [InlineData(503, (int)HyperReadProtocolFileResultCode.Unavailable)]
    [InlineData(504, (int)HyperReadProtocolFileResultCode.Timeout)]
    public async Task ReadMapsHttpStatus(int status, int expected)
    {
        var client = CreateClient((_, _) => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status)));
        var result = await client.ReadProtocolFileAsync(CreateDriveKey(), CreatePath(), CancellationToken.None);
        Assert.Equal((HyperReadProtocolFileResultCode)expected, result.ResultCode);
    }

    [Theory]
    [InlineData(412, (int)HyperWriteProtocolFileResultCode.Conflict)]
    [InlineData(403, (int)HyperWriteProtocolFileResultCode.NotWritable)]
    [InlineData(409, (int)HyperWriteProtocolFileResultCode.TargetConflict)]
    [InlineData(413, (int)HyperWriteProtocolFileResultCode.TooLarge)]
    [InlineData(503, (int)HyperWriteProtocolFileResultCode.Unavailable)]
    [InlineData(504, (int)HyperWriteProtocolFileResultCode.Timeout)]
    public async Task WriteMapsHttpStatus(int status, int expected)
    {
        var client = CreateClient((_, _) => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status)));
        var result = await client.WriteProtocolFileAsync(
            CreateDriveKey(), CreatePath(), new byte[] { 1 }, null, CancellationToken.None);
        Assert.Equal((HyperWriteProtocolFileResultCode)expected, result.ResultCode);
    }

    [Fact]
    public async Task InvalidWriteConditionAndOversizedContentNeverReachTransport()
    {
        var calls = 0;
        var client = CreateClient((_, _) =>
        {
            calls++;
            return Task.FromResult(ProtocolResponse([]));
        });
        await Assert.ThrowsAsync<HyperClientException>(() => client.WriteProtocolFileAsync(
            CreateDriveKey(), CreatePath(), new byte[] { 1 }, "W/\"weak\"", CancellationToken.None));
        var oversized = await client.WriteProtocolFileAsync(
            CreateDriveKey(), CreatePath(), new byte[65537], null, CancellationToken.None);
        Assert.Equal(HyperWriteProtocolFileResultCode.TooLarge, oversized.ResultCode);
        Assert.Equal(0, calls);
    }

    [Fact]
    public async Task ReadPropagatesCancellationWhileStreaming()
    {
        using var cancellation = new CancellationTokenSource();
        var readStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var client = CreateClient((_, _) =>
        {
            var response = ProtocolResponse([]);
            response.Content = new StreamContent(new WaitingReadStream(readStarted));
            response.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            return Task.FromResult(response);
        });
        var operation = client.ReadProtocolFileAsync(CreateDriveKey(), CreatePath(), cancellation.Token);
        await readStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => operation);
    }

    [Fact]
    public async Task WriteRejectsSuccessWithoutVersionConfirmation()
    {
        var client = CreateClient((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Created)));
        await Assert.ThrowsAsync<HyperClientException>(() => client.WriteProtocolFileAsync(
            CreateDriveKey(), CreatePath(), new byte[] { 1 }, null, CancellationToken.None));
    }

    private static HyperClient CreateClient(
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handle) =>
        new(new HttpClient(new Handler(handle))
        {
            BaseAddress = new Uri("http://hyper-client/"),
            Timeout = Timeout.InfiniteTimeSpan
        });

    private static HttpResponseMessage ProtocolResponse(
        byte[] content, HttpStatusCode statusCode = HttpStatusCode.OK)
    {
        var response = new HttpResponseMessage(statusCode) { Content = new ByteArrayContent(content) };
        response.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        response.Headers.ETag = new EntityTagHeaderValue("\"opaque-7\"");
        response.Headers.Add("X-Drive-Version", "7");
        return response;
    }

    private static DriveKey CreateDriveKey()
    {
        Assert.True(DriveKey.TryCreate(new string('a', 64), out var key));
        return key;
    }

    private static DriveFilePath CreatePath()
    {
        Assert.True(DriveFilePath.TryCreate(DriveManifest.Path, out var path));
        return path;
    }

    private sealed class Handler(
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handle) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) => handle(request, cancellationToken);
    }

    private sealed class NonSeekableReadStream(byte[] content) : Stream
    {
        private readonly MemoryStream inner = new(content);
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }
        public override int Read(byte[] buffer, int offset, int count) => inner.Read(buffer, offset, count);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
            inner.ReadAsync(buffer[..Math.Min(buffer.Length, 123)], cancellationToken);
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                inner.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    private sealed class WaitingReadStream(TaskCompletionSource started) : Stream
    {
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override async ValueTask<int> ReadAsync(
            Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            started.TrySetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return 0;
        }
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
