using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Cinereel.Features.Drive;

internal sealed class HyperClient : IHyperClient
{
    private const int MaxProtocolFileByteLength = 64 * 1024;
    private static readonly TimeSpan RegularRequestTimeout = TimeSpan.FromSeconds(100);
    private static readonly TimeSpan UploadResponseHeadersTimeout = TimeSpan.FromSeconds(100);
    private readonly HttpClient httpClient;
    private readonly TimeSpan uploadResponseHeadersTimeout;

    public HyperClient(HttpClient httpClient)
        : this(httpClient, UploadResponseHeadersTimeout)
    {
    }

    internal HyperClient(HttpClient httpClient, TimeSpan uploadResponseHeadersTimeout)
    {
        ArgumentNullException.ThrowIfNull(httpClient);

        if (uploadResponseHeadersTimeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(
                nameof(uploadResponseHeadersTimeout),
                "上传完成后的响应头超时必须大于零。");
        }

        this.httpClient = httpClient;
        this.uploadResponseHeadersTimeout = uploadResponseHeadersTimeout;
    }

    public async Task<DriveKey> EnsureDriveAsync(
        DriveId driveId,
        DriveName name,
        CancellationToken cancellationToken)
    {
        using var timeout = CreateRegularRequestTimeout(cancellationToken);
        using var response = await httpClient.PostAsJsonAsync(
            "v1/drives",
            new CreateHyperDriveRequest(
                driveId.ToString(),
                name.Value,
                "blob"),
            timeout.Token);

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<CreateHyperDriveResponse>(
            timeout.Token);

        if (body is null || !DriveKey.TryCreate(body.DriveKey, out var driveKey))
        {
            throw new HyperClientException(
                "Hyper Client 创建响应缺少有效的 driveKey。");
        }

        return driveKey;
    }

    public async Task DeleteAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken)
    {
        using var timeout = CreateRegularRequestTimeout(cancellationToken);
        using var response = await httpClient.DeleteAsync(
            $"v1/drives/{driveKey.Value}",
            timeout.Token);

        response.EnsureSuccessStatusCode();
    }

    public async Task<HyperDirectoryPage> ListDirectoryAsync(
        DriveKey driveKey,
        DriveDirectoryPath path,
        string? cursor,
        int limit,
        CancellationToken cancellationToken)
    {
        var requestUri = BuildListDirectoryUri(driveKey, path, cursor, limit);
        using var timeout = CreateRegularRequestTimeout(cancellationToken);
        using var response = await httpClient.GetAsync(
            requestUri,
            HttpCompletionOption.ResponseHeadersRead,
            timeout.Token);

        if (response.StatusCode != HttpStatusCode.OK)
        {
            response.EnsureSuccessStatusCode();
            throw UnexpectedSuccessStatus(response.StatusCode, "列举目录");
        }

        try
        {
            await using var responseStream = await response.Content.ReadAsStreamAsync(
                timeout.Token);
            using var document = await JsonDocument.ParseAsync(
                responseStream,
                cancellationToken: timeout.Token);

            return ParseDirectoryPage(document.RootElement, path, limit);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (HyperClientException)
        {
            throw;
        }
        catch (Exception exception) when (
            exception is JsonException or IOException or HttpRequestException)
        {
            throw new HyperClientException(
                "Hyper Client 返回了无法读取的目录响应。",
                exception);
        }
    }

    public async Task<HyperAddFileResultCode> AddFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        Stream content,
        CancellationToken cancellationToken)
    {
        using var responseTimeout = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Put,
            BuildFileUri(driveKey, path.Value));
        request.Content = new StreamContent(new EofNotifyingStream(
            content,
            () => responseTimeout.CancelAfter(uploadResponseHeadersTimeout)));
        request.Content.Headers.ContentType = new MediaTypeHeaderValue(
            "application/octet-stream");

        using var response = await httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            responseTimeout.Token);

        switch (response.StatusCode)
        {
            case HttpStatusCode.Created:
                return HyperAddFileResultCode.Created;
            case HttpStatusCode.Conflict:
                return HyperAddFileResultCode.AlreadyExists;
            case HttpStatusCode.Forbidden:
                return HyperAddFileResultCode.DriveNotWritable;
            case HttpStatusCode.RequestEntityTooLarge:
                return HyperAddFileResultCode.FileTooLarge;
            default:
                response.EnsureSuccessStatusCode();
                throw UnexpectedSuccessStatus(response.StatusCode, "新增文件");
        }
    }

    public async Task<HyperReadFileResult> ReadFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        using var timeout = CreateRegularRequestTimeout(cancellationToken);
        HttpResponseMessage? response = null;

        try
        {
            response = await httpClient.GetAsync(
                BuildReadFileUri(driveKey, path.Value),
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token);

            switch (response.StatusCode)
            {
                case HttpStatusCode.NotFound:
                    return new(HyperReadFileResultCode.NotFound);
                case HttpStatusCode.Conflict:
                    return new(HyperReadFileResultCode.InvalidTarget);
                case HttpStatusCode.ServiceUnavailable:
                    return new(HyperReadFileResultCode.Unavailable);
                case HttpStatusCode.GatewayTimeout:
                    return new(HyperReadFileResultCode.Timeout);
                case HttpStatusCode.OK:
                case HttpStatusCode.PartialContent:
                    break;
                default:
                    response.EnsureSuccessStatusCode();
                    throw UnexpectedSuccessStatus(response.StatusCode, "读取文件");
            }

            var content = await response.Content.ReadAsStreamAsync(timeout.Token);
            var result = new HyperReadFileResult(
                HyperReadFileResultCode.Success,
                new HttpResponseStream(content, response),
                response.Content.Headers.ContentType?.MediaType,
                response.Content.Headers.ContentLength);
            response = null;
            return result;
        }
        finally
        {
            response?.Dispose();
        }
    }

    public async Task<HyperDeleteFileResultCode> DeleteFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        using var timeout = CreateRegularRequestTimeout(cancellationToken);
        using var response = await httpClient.DeleteAsync(
            BuildFileUri(driveKey, path.Value),
            timeout.Token);

        switch (response.StatusCode)
        {
            case HttpStatusCode.OK:
                return HyperDeleteFileResultCode.Deleted;
            case HttpStatusCode.NotFound:
                return HyperDeleteFileResultCode.NotFound;
            case HttpStatusCode.Forbidden:
                return HyperDeleteFileResultCode.DriveNotWritable;
            default:
                response.EnsureSuccessStatusCode();
                throw UnexpectedSuccessStatus(response.StatusCode, "删除文件");
        }
    }

    public async Task<HyperDeleteDirectoryResultCode> DeleteDirectoryAsync(
        DriveKey driveKey,
        DriveDirectoryPath path,
        CancellationToken cancellationToken)
    {
        using var timeout = CreateRegularRequestTimeout(cancellationToken);
        using var response = await httpClient.DeleteAsync(
            BuildDirectoryUri(driveKey, path.Value),
            timeout.Token);

        switch (response.StatusCode)
        {
            case HttpStatusCode.OK:
                return HyperDeleteDirectoryResultCode.Deleted;
            case HttpStatusCode.Forbidden:
                return HyperDeleteDirectoryResultCode.DriveNotWritable;
            default:
                response.EnsureSuccessStatusCode();
                throw UnexpectedSuccessStatus(response.StatusCode, "删除目录");
        }
    }

    public async Task<HyperReadProtocolFileResult> ReadProtocolFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        using var timeout = CreateRegularRequestTimeout(cancellationToken);
        using var response = await httpClient.GetAsync(
            BuildProtocolFileUri(driveKey, path.Value),
            HttpCompletionOption.ResponseHeadersRead,
            timeout.Token);
        switch (response.StatusCode)
        {
            case HttpStatusCode.NotFound:
                return new(HyperReadProtocolFileResultCode.NotFound);
            case HttpStatusCode.Conflict:
                return new(HyperReadProtocolFileResultCode.InvalidTarget);
            case HttpStatusCode.RequestEntityTooLarge:
                return new(HyperReadProtocolFileResultCode.TooLarge);
            case HttpStatusCode.ServiceUnavailable:
                return new(HyperReadProtocolFileResultCode.Unavailable);
            case HttpStatusCode.GatewayTimeout:
                return new(HyperReadProtocolFileResultCode.Timeout);
            case HttpStatusCode.OK:
                break;
            default:
                response.EnsureSuccessStatusCode();
                throw UnexpectedSuccessStatus(response.StatusCode, "读取协议文件");
        }

        var (etag, driveVersion) = ReadProtocolFileHeaders(response);
        if (!string.Equals(
            response.Content.Headers.ContentType?.MediaType,
            "application/octet-stream",
            StringComparison.OrdinalIgnoreCase))
        {
            throw ProtocolError("协议文件响应的 Content-Type 必须为 application/octet-stream。");
        }

        var declaredLength = response.Content.Headers.ContentLength;
        if (declaredLength > MaxProtocolFileByteLength)
        {
            return new(HyperReadProtocolFileResultCode.TooLarge);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        var buffer = new byte[MaxProtocolFileByteLength + 1];
        var length = 0;
        while (length < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(length), timeout.Token);
            if (read == 0)
            {
                break;
            }

            length += read;
        }

        if (length > MaxProtocolFileByteLength)
        {
            return new(HyperReadProtocolFileResultCode.TooLarge);
        }

        if (declaredLength is not null && declaredLength != length)
        {
            throw ProtocolError("协议文件响应的 Content-Length 与实际正文不一致。");
        }

        return new(
            HyperReadProtocolFileResultCode.Success,
            buffer.AsSpan(0, length).ToArray(),
            etag,
            driveVersion);
    }

    public async Task<HyperWriteProtocolFileResult> WriteProtocolFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        ReadOnlyMemory<byte> content,
        string? expectedETag,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (content.Length > MaxProtocolFileByteLength)
        {
            return new(HyperWriteProtocolFileResultCode.TooLarge);
        }

        using var timeout = CreateRegularRequestTimeout(cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Put, BuildProtocolFileUri(driveKey, path.Value));
        request.Content = new ReadOnlyMemoryContent(content);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        if (expectedETag is null)
        {
            request.Headers.IfNoneMatch.Add(EntityTagHeaderValue.Any);
        }
        else
        {
            if (!TryParseStrongETag(expectedETag, out var etag))
            {
                throw ProtocolError("协议文件条件写入需要有效的强 ETag。");
            }

            request.Headers.IfMatch.Add(etag!);
        }

        using var response = await httpClient.SendAsync(
            request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        switch (response.StatusCode)
        {
            case HttpStatusCode.OK:
            case HttpStatusCode.Created:
                var (etag, driveVersion) = ReadProtocolFileHeaders(response);
                return new(HyperWriteProtocolFileResultCode.Written, etag, driveVersion);
            case HttpStatusCode.PreconditionFailed:
                return new(HyperWriteProtocolFileResultCode.Conflict);
            case HttpStatusCode.Forbidden:
                return new(HyperWriteProtocolFileResultCode.NotWritable);
            case HttpStatusCode.Conflict:
                return new(HyperWriteProtocolFileResultCode.TargetConflict);
            case HttpStatusCode.RequestEntityTooLarge:
                return new(HyperWriteProtocolFileResultCode.TooLarge);
            case HttpStatusCode.ServiceUnavailable:
                return new(HyperWriteProtocolFileResultCode.Unavailable);
            case HttpStatusCode.GatewayTimeout:
                return new(HyperWriteProtocolFileResultCode.Timeout);
            default:
                response.EnsureSuccessStatusCode();
                throw UnexpectedSuccessStatus(response.StatusCode, "写入协议文件");
        }
    }

    private static (string ETag, long DriveVersion) ReadProtocolFileHeaders(
        HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("ETag", out var etagValues) ||
            etagValues.ToArray() is not [var etag] ||
            !TryParseStrongETag(etag, out _))
        {
            throw ProtocolError("协议文件响应缺少有效的强 ETag。");
        }

        if (!response.Headers.TryGetValues("X-Drive-Version", out var versionValues) ||
            versionValues.ToArray() is not [var version] ||
            !long.TryParse(version, NumberStyles.None, CultureInfo.InvariantCulture,
                out var driveVersion) || driveVersion < 0)
        {
            throw ProtocolError("协议文件响应缺少有效的 X-Drive-Version。");
        }

        return (etag, driveVersion);
    }

    private static bool TryParseStrongETag(string value, out EntityTagHeaderValue? etag) =>
        EntityTagHeaderValue.TryParse(value, out etag) && !etag.IsWeak && etag.Tag != "*";

    private static string BuildListDirectoryUri(
        DriveKey driveKey,
        DriveDirectoryPath path,
        string? cursor,
        int limit)
    {
        var requestUri = BuildDirectoryUri(driveKey, path.Value);

        if (cursor is not null)
        {
            requestUri += $"&cursor={Uri.EscapeDataString(cursor)}";
        }

        return requestUri +
            $"&limit={limit.ToString(CultureInfo.InvariantCulture)}";
    }

    private static string BuildDirectoryUri(DriveKey driveKey, string path) =>
        $"v1/files/{driveKey.Value}/entries?path={Uri.EscapeDataString(path)}";

    private static string BuildFileUri(DriveKey driveKey, string path) =>
        $"v1/files/{driveKey.Value}?path={Uri.EscapeDataString(path)}";

    private static string BuildReadFileUri(DriveKey driveKey, string path) =>
        $"{BuildFileUri(driveKey, path)}&disposition=attachment";

    private static string BuildProtocolFileUri(DriveKey driveKey, string path) =>
        $"v1/protocol-files/{driveKey.Value}?path={Uri.EscapeDataString(path)}";

    private static CancellationTokenSource CreateRegularRequestTimeout(
        CancellationToken cancellationToken)
    {
        var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(RegularRequestTimeout);
        return timeout;
    }

    private static HyperDirectoryPage ParseDirectoryPage(
        JsonElement root,
        DriveDirectoryPath requestedPath,
        int requestedLimit)
    {
        RequireKind(root, JsonValueKind.Object, "目录响应");

        var path = ReadRequiredString(root, "path", "目录响应");
        if (!string.Equals(path, requestedPath.Value, StringComparison.Ordinal))
        {
            throw ProtocolError("目录响应的 path 与请求路径不一致。");
        }

        var driveVersion = ReadRequiredNonNegativeInteger(
            root,
            "driveVersion",
            "目录响应");
        var entriesElement = ReadRequiredProperty(root, "entries", "目录响应");
        RequireKind(entriesElement, JsonValueKind.Array, "目录响应的 entries");

        var entries = new List<HyperDirectoryEntry>();
        foreach (var entryElement in entriesElement.EnumerateArray())
        {
            entries.Add(ParseDirectoryEntry(entryElement, path));
        }

        if (entries.Count > requestedLimit)
        {
            throw ProtocolError("目录响应的 entries 数量超过请求的 limit。");
        }

        var nextCursorElement = ReadRequiredProperty(
            root,
            "nextCursor",
            "目录响应");
        var nextCursor = nextCursorElement.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.String => nextCursorElement.GetString(),
            _ => throw ProtocolError("目录响应的 nextCursor 必须是字符串或 null。")
        };

        if (nextCursor is not null &&
            (!DriveFilePath.IsValidSegment(nextCursor) ||
             entries.Count == 0 ||
             !string.Equals(entries[^1].Name, nextCursor, StringComparison.Ordinal)))
        {
            throw ProtocolError("目录响应的 nextCursor 不是有效的末项游标。");
        }

        return new HyperDirectoryPage(path, driveVersion, entries, nextCursor);
    }

    private static HyperDirectoryEntry ParseDirectoryEntry(
        JsonElement element,
        string parentPath)
    {
        RequireKind(element, JsonValueKind.Object, "目录子项");

        var path = ReadRequiredString(element, "path", "目录子项");
        var name = ReadRequiredString(element, "name", "目录子项");
        if (!DriveFilePath.IsValidSegment(name))
        {
            throw ProtocolError("目录子项的 name 不是有效路径段。");
        }

        var expectedPath = parentPath == "/"
            ? $"/{name}"
            : $"{parentPath}/{name}";
        if (!string.Equals(path, expectedPath, StringComparison.Ordinal))
        {
            throw ProtocolError("目录子项的 path 不是请求目录的直接子项。");
        }

        var type = ReadRequiredString(element, "type", "目录子项");
        if (type is not ("file" or "directory" or "symlink"))
        {
            throw ProtocolError("目录子项的 type 不受支持。");
        }

        var sizeElement = ReadRequiredProperty(element, "size", "目录子项");
        long? size = sizeElement.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.Number when sizeElement.TryGetInt64(out var value) && value >= 0 =>
                value,
            _ => throw ProtocolError("目录子项的 size 必须是非负整数或 null。")
        };

        return new HyperDirectoryEntry(path, name, type, size);
    }

    private static JsonElement ReadRequiredProperty(
        JsonElement element,
        string propertyName,
        string context)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            throw ProtocolError($"{context}缺少 {propertyName}。");
        }

        return property;
    }

    private static string ReadRequiredString(
        JsonElement element,
        string propertyName,
        string context)
    {
        var property = ReadRequiredProperty(element, propertyName, context);
        if (property.ValueKind != JsonValueKind.String ||
            property.GetString() is not { } value)
        {
            throw ProtocolError($"{context}的 {propertyName} 必须是字符串。");
        }

        return value;
    }

    private static long ReadRequiredNonNegativeInteger(
        JsonElement element,
        string propertyName,
        string context)
    {
        var property = ReadRequiredProperty(element, propertyName, context);
        if (property.ValueKind != JsonValueKind.Number ||
            !property.TryGetInt64(out var value) ||
            value < 0)
        {
            throw ProtocolError($"{context}的 {propertyName} 必须是非负整数。");
        }

        return value;
    }

    private static void RequireKind(
        JsonElement element,
        JsonValueKind expectedKind,
        string context)
    {
        if (element.ValueKind != expectedKind)
        {
            throw ProtocolError($"{context}的 JSON 形状无效。");
        }
    }

    private static HyperClientException ProtocolError(string message) =>
        new($"Hyper Client 协议错误：{message}");

    private static HyperClientException UnexpectedSuccessStatus(
        HttpStatusCode statusCode,
        string operation) =>
        ProtocolError(
            $"{operation}返回了未约定的成功状态码 {(int)statusCode}。");

    private sealed record CreateHyperDriveRequest(
        string Namespace,
        string Name,
        string Type);

    private sealed record CreateHyperDriveResponse(string DriveKey);

    private sealed class HttpResponseStream(
        Stream inner,
        HttpResponseMessage response) : Stream
    {
        private int disposed;

        public override bool CanRead => inner.CanRead;

        public override bool CanSeek => inner.CanSeek;

        public override bool CanWrite => inner.CanWrite;

        public override long Length => inner.Length;

        public override long Position
        {
            get => inner.Position;
            set => inner.Position = value;
        }

        public override void Flush() => inner.Flush();

        public override Task FlushAsync(CancellationToken cancellationToken) =>
            inner.FlushAsync(cancellationToken);

        public override int Read(byte[] buffer, int offset, int count) =>
            inner.Read(buffer, offset, count);

        public override int Read(Span<byte> buffer) => inner.Read(buffer);

        public override Task<int> ReadAsync(
            byte[] buffer,
            int offset,
            int count,
            CancellationToken cancellationToken) =>
            inner.ReadAsync(buffer, offset, count, cancellationToken);

        public override ValueTask<int> ReadAsync(
            Memory<byte> buffer,
            CancellationToken cancellationToken = default) =>
            inner.ReadAsync(buffer, cancellationToken);

        public override long Seek(long offset, SeekOrigin origin) =>
            inner.Seek(offset, origin);

        public override void SetLength(long value) => inner.SetLength(value);

        public override void Write(byte[] buffer, int offset, int count) =>
            inner.Write(buffer, offset, count);

        public override void Write(ReadOnlySpan<byte> buffer) => inner.Write(buffer);

        public override Task WriteAsync(
            byte[] buffer,
            int offset,
            int count,
            CancellationToken cancellationToken) =>
            inner.WriteAsync(buffer, offset, count, cancellationToken);

        public override ValueTask WriteAsync(
            ReadOnlyMemory<byte> buffer,
            CancellationToken cancellationToken = default) =>
            inner.WriteAsync(buffer, cancellationToken);

        protected override void Dispose(bool disposing)
        {
            if (disposing && Interlocked.Exchange(ref disposed, 1) == 0)
            {
                try
                {
                    inner.Dispose();
                }
                finally
                {
                    response.Dispose();
                }
            }

            base.Dispose(disposing);
        }

        public override async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref disposed, 1) == 0)
            {
                try
                {
                    await inner.DisposeAsync();
                }
                finally
                {
                    response.Dispose();
                }
            }

            GC.SuppressFinalize(this);
        }
    }

    private sealed class EofNotifyingStream(Stream inner, Action notifyEof) : Stream
    {
        private int eofNotified;

        public override bool CanRead => inner.CanRead;

        public override bool CanSeek => inner.CanSeek;

        public override bool CanWrite => inner.CanWrite;

        public override long Length => inner.Length;

        public override long Position
        {
            get => inner.Position;
            set => inner.Position = value;
        }

        public override void Flush() => inner.Flush();

        public override Task FlushAsync(CancellationToken cancellationToken) =>
            inner.FlushAsync(cancellationToken);

        public override int Read(byte[] buffer, int offset, int count) =>
            NotifyEof(inner.Read(buffer, offset, count));

        public override int Read(Span<byte> buffer) => NotifyEof(inner.Read(buffer));

        public override int ReadByte()
        {
            var value = inner.ReadByte();

            if (value == -1)
            {
                NotifyEof();
            }

            return value;
        }

        public override async Task<int> ReadAsync(
            byte[] buffer,
            int offset,
            int count,
            CancellationToken cancellationToken)
        {
            var bytesRead = await inner.ReadAsync(
                buffer,
                offset,
                count,
                cancellationToken);
            return NotifyEof(bytesRead);
        }

        public override async ValueTask<int> ReadAsync(
            Memory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            var bytesRead = await inner.ReadAsync(buffer, cancellationToken);
            return NotifyEof(bytesRead);
        }

        public override long Seek(long offset, SeekOrigin origin) =>
            inner.Seek(offset, origin);

        public override void SetLength(long value) => inner.SetLength(value);

        public override void Write(byte[] buffer, int offset, int count) =>
            inner.Write(buffer, offset, count);

        public override void Write(ReadOnlySpan<byte> buffer) => inner.Write(buffer);

        public override Task WriteAsync(
            byte[] buffer,
            int offset,
            int count,
            CancellationToken cancellationToken) =>
            inner.WriteAsync(buffer, offset, count, cancellationToken);

        public override ValueTask WriteAsync(
            ReadOnlyMemory<byte> buffer,
            CancellationToken cancellationToken = default) =>
            inner.WriteAsync(buffer, cancellationToken);

        protected override void Dispose(bool disposing)
        {
        }

        public override ValueTask DisposeAsync() => ValueTask.CompletedTask;

        private int NotifyEof(int bytesRead)
        {
            if (bytesRead == 0)
            {
                NotifyEof();
            }

            return bytesRead;
        }

        private void NotifyEof()
        {
            if (Interlocked.Exchange(ref eofNotified, 1) == 0)
            {
                notifyEof();
            }
        }
    }
}
