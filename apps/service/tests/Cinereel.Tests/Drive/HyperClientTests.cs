using System.Net;
using System.Text;
using System.Text.Json;
using Cinereel.Features.Drive;
using Xunit;

namespace Cinereel.Tests.Drive;

public sealed class HyperClientTests
{
    [Fact]
    public async Task CreateUsesDriveIdAsNamespaceAndBlobStorage()
    {
        var driveId = DriveId.New();
        Assert.True(DriveName.TryCreate("电影资料", out var name));
        var handler = new RecordingHandler(_ => JsonResponse(
            $$"""{"driveKey":"{{new string('A', 64)}}"}"""));
        var client = CreateClient(handler);

        var driveKey = await client.EnsureDriveAsync(
            driveId,
            name,
            CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("http://hyper-client/v1/drives", request.RequestUri?.ToString());
        using var document = JsonDocument.Parse(Assert.IsType<string>(request.Body));
        Assert.Equal(
            driveId.ToString(),
            document.RootElement.GetProperty("namespace").GetString());
        Assert.Equal(
            name.Value,
            document.RootElement.GetProperty("name").GetString());
        Assert.Equal(
            "blob",
            document.RootElement.GetProperty("type").GetString());
        Assert.Equal(new string('a', 64), driveKey.Value);
    }

    [Fact]
    public async Task DeleteUsesDriveKeyInRoute()
    {
        var driveKey = CreateDriveKey('b');
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var client = CreateClient(handler);

        await client.DeleteAsync(driveKey, CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Delete, request.Method);
        Assert.Equal(
            $"http://hyper-client/v1/drives/{driveKey.Value}",
            request.RequestUri?.ToString());
    }

    [Fact]
    public async Task CreateRejectsInvalidDriveKeyFromHyperClient()
    {
        var handler = new RecordingHandler(_ => JsonResponse(
            """{"driveKey":"invalid"}"""));
        var client = CreateClient(handler);
        Assert.True(DriveName.TryCreate("Drive", out var name));

        await Assert.ThrowsAsync<HyperClientException>(() =>
            client.EnsureDriveAsync(DriveId.New(), name, CancellationToken.None));
    }

    [Fact]
    public async Task ListDirectoryEncodesQueryAndMapsResponse()
    {
        var driveKey = CreateDriveKey('c');
        var path = CreateDirectoryPath("/电影 资料");
        var handler = new RecordingHandler(_ => JsonResponse(
            """
            {
              "path": "/电影 资料",
              "driveVersion": 7,
              "entries": [
                { "path": "/电影 资料/action.mkv", "name": "action.mkv", "type": "file", "size": 42 },
                { "path": "/电影 资料/drama", "name": "drama", "type": "directory", "size": null },
                { "path": "/电影 资料/科幻 &=", "name": "科幻 &=", "type": "symlink", "size": 0 }
              ],
              "nextCursor": "科幻 &="
            }
            """));
        var client = CreateClient(handler);

        var page = await client.ListDirectoryAsync(
            driveKey,
            path,
            "上一页 &=",
            37,
            CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal(
            $"http://hyper-client/v1/files/{driveKey.Value}/entries" +
            "?path=%2F%E7%94%B5%E5%BD%B1%20%E8%B5%84%E6%96%99" +
            "&cursor=%E4%B8%8A%E4%B8%80%E9%A1%B5%20%26%3D&limit=37",
            request.RequestUri?.AbsoluteUri);
        Assert.Equal(path.Value, page.Path);
        Assert.Equal(7, page.DriveVersion);
        Assert.Collection(
            page.Entries,
            entry => Assert.Equal(
                new HyperDirectoryEntry(
                    "/电影 资料/action.mkv",
                    "action.mkv",
                    "file",
                    42),
                entry),
            entry => Assert.Equal(
                new HyperDirectoryEntry(
                    "/电影 资料/drama",
                    "drama",
                    "directory",
                    null),
                entry),
            entry => Assert.Equal(
                new HyperDirectoryEntry(
                    "/电影 资料/科幻 &=",
                    "科幻 &=",
                    "symlink",
                    0),
                entry));
        Assert.Equal("科幻 &=", page.NextCursor);
    }

    [Fact]
    public async Task ListDirectoryOmitsNullCursor()
    {
        var driveKey = CreateDriveKey('d');
        var handler = new RecordingHandler(_ => JsonResponse(
            """{"path":"/","driveVersion":0,"entries":[],"nextCursor":null}"""));
        var client = CreateClient(handler);

        await client.ListDirectoryAsync(
            driveKey,
            CreateDirectoryPath("/"),
            null,
            100,
            CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(
            $"http://hyper-client/v1/files/{driveKey.Value}/entries?path=%2F&limit=100",
            request.RequestUri?.AbsoluteUri);
    }

    [Fact]
    public async Task AddFileUsesEncodedPathAndStreamingOctetContent()
    {
        var driveKey = CreateDriveKey('e');
        var path = CreateFilePath("/电影/正片 &=.mkv");
        var body = Enumerable.Range(0, 4096)
            .Select(index => (byte)(index % 251))
            .ToArray();
        await using var content = new MemoryStream(body);
        var handler = new RecordingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.Created));
        var client = CreateClient(handler);

        var result = await client.AddFileAsync(
            driveKey,
            path,
            content,
            CancellationToken.None);

        Assert.Equal(HyperAddFileResultCode.Created, result);
        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Put, request.Method);
        Assert.Equal(
            $"http://hyper-client/v1/files/{driveKey.Value}" +
            "?path=%2F%E7%94%B5%E5%BD%B1%2F%E6%AD%A3%E7%89%87%20%26%3D.mkv",
            request.RequestUri?.AbsoluteUri);
        Assert.Equal(typeof(StreamContent), request.ContentType);
        Assert.Equal("application/octet-stream", request.MediaType);
        Assert.Equal(body, request.BodyBytes);
        Assert.True(content.CanRead);
    }

    [Fact]
    public async Task AddFileDoesNotStartResponseTimeoutBeforeUploadReachesEof()
    {
        var responseTimeout = TimeSpan.FromMilliseconds(100);
        await using var content = new GatedUploadStream([1, 2, 3]);
        var handler = new RecordingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.Created));
        var client = CreateClient(handler, responseTimeout);
        var operation = client.AddFileAsync(
            CreateDriveKey('f'),
            CreateFilePath("/slow-upload.mkv"),
            content,
            CancellationToken.None);

        try
        {
            await content.ReadStarted.WaitAsync(TimeSpan.FromSeconds(5));
            await Task.Delay(responseTimeout * 3);
            Assert.False(operation.IsCompleted);
        }
        finally
        {
            content.Release();
        }

        var result = await operation.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(HyperAddFileResultCode.Created, result);
        Assert.True(content.CanRead);
    }

    [Fact]
    public async Task AddFilePropagatesCallerCancellationDuringUpload()
    {
        await using var content = new GatedUploadStream([1, 2, 3]);
        using var callerCancellation = new CancellationTokenSource();
        var handler = new RecordingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.Created));
        var client = CreateClient(handler);
        var operation = client.AddFileAsync(
            CreateDriveKey('a'),
            CreateFilePath("/cancelled-upload.mkv"),
            content,
            callerCancellation.Token);

        await content.ReadStarted.WaitAsync(TimeSpan.FromSeconds(5));
        callerCancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
            await operation.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.True(callerCancellation.IsCancellationRequested);
        Assert.True(content.CanRead);
    }

    [Fact]
    public async Task AddFileStartsResponseTimeoutAfterUploadReachesEof()
    {
        var responseTimeout = TimeSpan.FromMilliseconds(100);
        await using var content = new MemoryStream([1, 2, 3]);
        using var callerCancellation = new CancellationTokenSource();
        var handler = new HangingAfterBodyHandler();
        var client = CreateClient(handler, responseTimeout);
        var operation = client.AddFileAsync(
            CreateDriveKey('a'),
            CreateFilePath("/completed-upload.mkv"),
            content,
            callerCancellation.Token);

        await handler.BodyRead.WaitAsync(TimeSpan.FromSeconds(5));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
            await operation.WaitAsync(TimeSpan.FromSeconds(5)));

        Assert.False(callerCancellation.IsCancellationRequested);
        Assert.True(content.CanRead);
    }

    [Theory]
    [InlineData(201, "Created")]
    [InlineData(409, "AlreadyExists")]
    [InlineData(403, "DriveNotWritable")]
    [InlineData(413, "FileTooLarge")]
    public async Task AddFileMapsContractStatusCodes(int statusCode, string expectedName)
    {
        var handler = new RecordingHandler(_ => new HttpResponseMessage(
            (HttpStatusCode)statusCode)
        {
            Content = new StringContent("中文正文不参与结果码判断。")
        });
        var client = CreateClient(handler);

        var result = await client.AddFileAsync(
            CreateDriveKey('f'),
            CreateFilePath("/movie.mkv"),
            new MemoryStream([1, 2, 3]),
            CancellationToken.None);

        Assert.Equal(
            Enum.Parse<HyperAddFileResultCode>(expectedName),
            result);
    }

    [Theory]
    [InlineData(200, "Deleted")]
    [InlineData(404, "NotFound")]
    [InlineData(403, "DriveNotWritable")]
    public async Task DeleteFileMapsContractStatusCodes(int statusCode, string expectedName)
    {
        var driveKey = CreateDriveKey('a');
        var path = CreateFilePath("/目录/文件 &=.txt");
        var handler = new RecordingHandler(_ => new HttpResponseMessage(
            (HttpStatusCode)statusCode)
        {
            Content = new StringContent("中文正文不参与结果码判断。")
        });
        var client = CreateClient(handler);

        var result = await client.DeleteFileAsync(
            driveKey,
            path,
            CancellationToken.None);

        Assert.Equal(
            Enum.Parse<HyperDeleteFileResultCode>(expectedName),
            result);
        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Delete, request.Method);
        Assert.Equal(
            $"http://hyper-client/v1/files/{driveKey.Value}" +
            "?path=%2F%E7%9B%AE%E5%BD%95%2F%E6%96%87%E4%BB%B6%20%26%3D.txt",
            request.RequestUri?.AbsoluteUri);
    }

    [Theory]
    [InlineData(200, "Deleted")]
    [InlineData(403, "DriveNotWritable")]
    public async Task DeleteDirectoryMapsContractStatusCodes(
        int statusCode,
        string expectedName)
    {
        var driveKey = CreateDriveKey('b');
        var path = CreateDirectoryPath("/目录 &=");
        var handler = new RecordingHandler(_ => new HttpResponseMessage(
            (HttpStatusCode)statusCode)
        {
            Content = new StringContent("中文正文不参与结果码判断。")
        });
        var client = CreateClient(handler);

        var result = await client.DeleteDirectoryAsync(
            driveKey,
            path,
            CancellationToken.None);

        Assert.Equal(
            Enum.Parse<HyperDeleteDirectoryResultCode>(expectedName),
            result);
        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Delete, request.Method);
        Assert.Equal(
            $"http://hyper-client/v1/files/{driveKey.Value}/entries" +
            "?path=%2F%E7%9B%AE%E5%BD%95%20%26%3D",
            request.RequestUri?.AbsoluteUri);
    }

    [Fact]
    public async Task OperationsRejectUncontractedSuccessStatusCodes()
    {
        var responses = new Queue<HttpStatusCode>(
        [
            HttpStatusCode.NoContent,
            HttpStatusCode.OK,
            HttpStatusCode.NoContent,
            HttpStatusCode.Created
        ]);
        var handler = new RecordingHandler(_ =>
            new HttpResponseMessage(responses.Dequeue()));
        var client = CreateClient(handler);
        var driveKey = CreateDriveKey('c');

        await Assert.ThrowsAsync<HyperClientException>(() =>
            client.ListDirectoryAsync(
                driveKey,
                CreateDirectoryPath("/"),
                null,
                100,
                CancellationToken.None));
        await Assert.ThrowsAsync<HyperClientException>(() =>
            client.AddFileAsync(
                driveKey,
                CreateFilePath("/file"),
                new MemoryStream([1]),
                CancellationToken.None));
        await Assert.ThrowsAsync<HyperClientException>(() =>
            client.DeleteFileAsync(
                driveKey,
                CreateFilePath("/file"),
                CancellationToken.None));
        await Assert.ThrowsAsync<HyperClientException>(() =>
            client.DeleteDirectoryAsync(
                driveKey,
                CreateDirectoryPath("/directory"),
                CancellationToken.None));
    }

    [Fact]
    public async Task UnknownFailureStatusUsesHttpFailure()
    {
        var handler = new RecordingHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var client = CreateClient(handler);

        await Assert.ThrowsAsync<HttpRequestException>(() =>
            client.DeleteFileAsync(
                CreateDriveKey('d'),
                CreateFilePath("/file"),
                CancellationToken.None));
    }

    [Theory]
    [MemberData(nameof(MalformedDirectoryResponses))]
    public async Task ListDirectoryRejectsMalformedProtocolResponses(string responseBody)
    {
        var handler = new RecordingHandler(_ => JsonResponse(responseBody));
        var client = CreateClient(handler);

        await Assert.ThrowsAsync<HyperClientException>(() =>
            client.ListDirectoryAsync(
                CreateDriveKey('e'),
                CreateDirectoryPath("/movies"),
                null,
                2,
                CancellationToken.None));
    }

    [Fact]
    public async Task ListDirectoryPreservesCancellation()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var client = CreateClient(new CancellationHandler());

        var exception = await Record.ExceptionAsync(() =>
            client.ListDirectoryAsync(
                CreateDriveKey('f'),
                CreateDirectoryPath("/"),
                null,
                100,
                cancellation.Token));

        Assert.IsAssignableFrom<OperationCanceledException>(exception);
        Assert.IsNotType<HyperClientException>(exception);
    }

    public static IEnumerable<object[]> MalformedDirectoryResponses()
    {
        yield return ["not-json"];
        yield return ["[]"];
        yield return
        [
            """{"path":"/other","driveVersion":1,"entries":[],"nextCursor":null}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":-1,"entries":[],"nextCursor":null}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1.5,"entries":[],"nextCursor":null}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1,"entries":{},"nextCursor":null}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1,"entries":[{"path":"/movies/file","name":"file","type":"socket","size":1}],"nextCursor":null}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1,"entries":[{"path":"/movies/file","name":"file","type":"file","size":-1}],"nextCursor":null}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1,"entries":[{"path":"/movies/file","name":"nested/file","type":"file","size":1}],"nextCursor":null}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1,"entries":[{"path":"/movies/nested/file","name":"file","type":"file","size":1}],"nextCursor":null}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1,"entries":[],"nextCursor":"file"}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1,"entries":[{"path":"/movies/file","name":"file","type":"file","size":1}],"nextCursor":"other"}"""
        ];
        yield return
        [
            """{"path":"/movies","driveVersion":1,"entries":[{"path":"/movies/a","name":"a","type":"file","size":1},{"path":"/movies/b","name":"b","type":"file","size":1},{"path":"/movies/c","name":"c","type":"file","size":1}],"nextCursor":null}"""
        ];
    }

    private static HyperClient CreateClient(
        HttpMessageHandler handler,
        TimeSpan? uploadResponseHeadersTimeout = null)
    {
        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://hyper-client/"),
            Timeout = Timeout.InfiniteTimeSpan
        };

        return uploadResponseHeadersTimeout is null
            ? new HyperClient(httpClient)
            : new HyperClient(httpClient, uploadResponseHeadersTimeout.Value);
    }

    private static DriveKey CreateDriveKey(char character)
    {
        Assert.True(DriveKey.TryCreate(new string(character, 64), out var driveKey));
        return driveKey;
    }

    private static DriveDirectoryPath CreateDirectoryPath(string value)
    {
        Assert.True(DriveDirectoryPath.TryCreate(value, out var path));
        return path;
    }

    private static DriveFilePath CreateFilePath(string value)
    {
        Assert.True(DriveFilePath.TryCreate(value, out var path));
        return path;
    }

    private static HttpResponseMessage JsonResponse(string body) =>
        new(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };

    private sealed class RecordingHandler(
        Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        internal List<RecordedRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var bodyBytes = request.Content is null
                ? null
                : await request.Content.ReadAsByteArrayAsync(cancellationToken);
            Requests.Add(new RecordedRequest(
                request.Method,
                request.RequestUri,
                bodyBytes is null ? null : Encoding.UTF8.GetString(bodyBytes),
                bodyBytes,
                request.Content?.GetType(),
                request.Content?.Headers.ContentType?.MediaType));
            return respond(request);
        }
    }

    private sealed class CancellationHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromCanceled<HttpResponseMessage>(cancellationToken);
    }

    private sealed class HangingAfterBodyHandler : HttpMessageHandler
    {
        private readonly TaskCompletionSource<bool> bodyRead = new(
            TaskCreationOptions.RunContinuationsAsynchronously);

        internal Task BodyRead => bodyRead.Task;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            await request.Content!.CopyToAsync(Stream.Null, cancellationToken);
            bodyRead.TrySetResult(true);
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            throw new InvalidOperationException("取消后不应继续等待响应。");
        }
    }

    private sealed class GatedUploadStream(byte[] content) : Stream
    {
        private readonly TaskCompletionSource<bool> readStarted = new(
            TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource<bool> release = new(
            TaskCreationOptions.RunContinuationsAsynchronously);
        private int position;
        private bool disposed;

        internal Task ReadStarted => readStarted.Task;

        public override bool CanRead => !disposed;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        internal void Release() => release.TrySetResult(true);

        public override void Flush()
        {
        }

        public override int Read(byte[] buffer, int offset, int count) =>
            throw new NotSupportedException();

        public override async ValueTask<int> ReadAsync(
            Memory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            readStarted.TrySetResult(true);
            await release.Task.WaitAsync(cancellationToken);

            if (position == content.Length)
            {
                return 0;
            }

            var bytesRead = Math.Min(buffer.Length, content.Length - position);
            content.AsMemory(position, bytesRead).CopyTo(buffer);
            position += bytesRead;
            return bytesRead;
        }

        public override long Seek(long offset, SeekOrigin origin) =>
            throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) =>
            throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            disposed = true;
            release.TrySetResult(true);
            base.Dispose(disposing);
        }
    }

    private sealed record RecordedRequest(
        HttpMethod Method,
        Uri? RequestUri,
        string? Body,
        byte[]? BodyBytes,
        Type? ContentType,
        string? MediaType);
}
