using Ardalis.Result;

namespace Cinereel.Features.Drive;

internal sealed class DriveFileService(
    IDriveRepository driveRepository,
    IHyperClient hyperClient,
    ILogger<DriveFileService> logger) : IDriveFileService
{
    private const string HyperDriveWriteKeyUnavailableMessage =
        "Hyper Client 当前没有该 Drive 的本地写密钥，请检查 CONFIG_DIR 是否与创建 Drive 时一致。";

    private readonly long maxFileSize = IDriveFileService.MaxFileSize;

    internal DriveFileService(
        IDriveRepository driveRepository,
        IHyperClient hyperClient,
        ILogger<DriveFileService> logger,
        long maxFileSize)
        : this(driveRepository, hyperClient, logger)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(maxFileSize);
        this.maxFileSize = maxFileSize;
    }

    public async Task<Result<DriveDirectoryResponse>> ListDirectoryAsync(
        DriveId driveId,
        DriveDirectoryPath path,
        DriveDirectoryCursor? cursor,
        int limit,
        CancellationToken cancellationToken)
    {
        ValidateDirectoryPath(path);

        if (cursor is { } providedCursor &&
            !DriveDirectoryCursor.TryParse(providedCursor.Value, out _))
        {
            throw new ArgumentException("cursor 无效。", nameof(cursor));
        }

        if (limit is < 1 or > IDriveFileService.MaxDirectoryPageSize)
        {
            throw new ArgumentOutOfRangeException(
                nameof(limit),
                $"limit 必须是 1 到 {IDriveFileService.MaxDirectoryPageSize} 之间的整数。");
        }

        var drive = await FindVisibleDriveAsync(driveId, cancellationToken);

        if (drive is null)
        {
            return Result<DriveDirectoryResponse>.NotFound("Drive 不存在。其关系可能已被移除。");
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return Result<DriveDirectoryResponse>.Conflict("Drive 尚未就绪。");
        }

        if (IsReservedPath(path.Value))
        {
            return Result<DriveDirectoryResponse>.Forbidden("目标位于 /.cinereel 协议保留目录。");
        }

        try
        {
            var page = await hyperClient.ListDirectoryAsync(
                driveKey,
                path,
                cursor?.ChildName,
                limit,
                cancellationToken);

            if (page.DriveVersion < 0)
            {
                throw new InvalidOperationException("Hyper Client 返回了无效的 Drive 版本。");
            }

            if (cursor is { } versionedCursor &&
                versionedCursor.DriveVersion != page.DriveVersion)
            {
                return Result<DriveDirectoryResponse>.Conflict(
                    "Drive 内容版本已变化，请从第一页重新列举目录。");
            }

            var nextCursor = page.NextCursor is null
                ? null
                : DriveDirectoryCursor.Create(page.DriveVersion, page.NextCursor).Value;
            var response = new DriveDirectoryResponse(
                page.Path,
                page.DriveVersion,
                page.Entries
                    .Select(entry => new DriveDirectoryEntryResponse(
                        entry.Path,
                        entry.Name,
                        entry.Type,
                        entry.Size))
                    .ToArray(),
                nextCursor);
            return Result<DriveDirectoryResponse>.Success(response);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            logger.LogWarning(
                exception,
                "列举 Drive {DriveId} 的目录 {Path} 失败，内容暂不可用。",
                driveId,
                path.Value);
            return Result<DriveDirectoryResponse>.CriticalError(
                "Drive 内容暂不可用。请稍后重试。");
        }
    }

    public async Task<Result<object>> AddFileAsync(
        DriveId driveId,
        DriveFilePath path,
        Stream content,
        CancellationToken cancellationToken)
    {
        ValidateFilePath(path);
        ArgumentNullException.ThrowIfNull(content);

        if (!content.CanRead)
        {
            throw new ArgumentException("content 必须是可读流。", nameof(content));
        }

        var drive = await FindVisibleDriveAsync(driveId, cancellationToken);

        if (drive is null)
        {
            return Result<object>.NotFound("Drive 不存在。其关系可能已被移除。");
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return Result<object>.Conflict("Drive 尚未就绪。");
        }

        if (drive.RelationType != DriveRelationType.Ownership)
        {
            return Result<object>.Forbidden("当前 Cinereel 不持有该 Drive 的写权限。");
        }

        if (IsReservedPath(path.Value))
        {
            return Result<object>.Forbidden("目标位于 /.cinereel 协议保留目录。");
        }

        try
        {
            using var limitedContent = new FileSizeLimitedReadStream(content, maxFileSize);
            var resultCode = await hyperClient.AddFileAsync(
                driveKey,
                path,
                limitedContent,
                cancellationToken);

            return resultCode switch
            {
                HyperAddFileResultCode.Created => Result<object>.Created(null!),
                HyperAddFileResultCode.AlreadyExists => Result<object>.Conflict("目标路径已经存在。"),
                HyperAddFileResultCode.DriveNotWritable =>
                    Result<object>.Forbidden(HyperDriveWriteKeyUnavailableMessage),
                HyperAddFileResultCode.FileTooLarge => Result<object>.Invalid(
                    new ValidationError("文件不能超过 500 MiB。")),
                _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
            };
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (ContainsFileSizeLimitExceeded(exception))
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Result<object>.Invalid(new ValidationError("文件不能超过 500 MiB。"));
        }
        catch (Exception exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            logger.LogWarning(
                exception,
                "向 Drive {DriveId} 增加文件 {Path} 失败，内容服务暂不可用。",
                driveId,
                path.Value);
            return Result<object>.CriticalError("Drive 内容暂不可用。请稍后重试。");
        }
    }

    public async Task<Result<DriveFileDownloadResponse>> DownloadFileAsync(
        DriveId driveId,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        ValidateFilePath(path);
        var drive = await FindVisibleDriveAsync(driveId, cancellationToken);

        if (drive is null)
        {
            return Result<DriveFileDownloadResponse>.NotFound(
                "Drive 不存在。其关系可能已被移除。");
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return Result<DriveFileDownloadResponse>.Conflict("Drive 尚未就绪。");
        }

        if (IsReservedPath(path.Value))
        {
            return Result<DriveFileDownloadResponse>.Forbidden(
                "目标位于 /.cinereel 协议保留目录。");
        }

        try
        {
            var result = await hyperClient.ReadFileAsync(
                driveKey,
                path,
                cancellationToken);

            return result.ResultCode switch
            {
                HyperReadFileResultCode.Success when result.Content is not null =>
                    Result<DriveFileDownloadResponse>.Success(
                        new DriveFileDownloadResponse(
                            result.Content,
                            GetFileName(path),
                            result.ContentType ?? "application/octet-stream",
                            result.ContentLength)),
                HyperReadFileResultCode.NotFound =>
                    Result<DriveFileDownloadResponse>.NotFound("目标文件不存在。"),
                HyperReadFileResultCode.InvalidTarget =>
                    Result<DriveFileDownloadResponse>.Conflict("目标不是可下载的文件。"),
                HyperReadFileResultCode.Unavailable or HyperReadFileResultCode.Timeout =>
                    Result<DriveFileDownloadResponse>.CriticalError(
                        "Drive 内容暂不可用。请稍后重试。"),
                HyperReadFileResultCode.Success => throw new InvalidOperationException(
                    "Hyper Client 返回了没有正文的成功文件响应。"),
                _ => throw new ArgumentOutOfRangeException(nameof(result.ResultCode))
            };
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            logger.LogWarning(
                exception,
                "读取 Drive {DriveId} 的文件 {Path} 失败，内容服务暂不可用。",
                driveId,
                path.Value);
            return Result<DriveFileDownloadResponse>.CriticalError(
                "Drive 内容暂不可用。请稍后重试。");
        }
    }

    public async Task<Result> DeleteFileAsync(
        DriveId driveId,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        ValidateFilePath(path);
        var drive = await FindVisibleDriveAsync(driveId, cancellationToken);

        if (drive is null)
        {
            return Result.NotFound("Drive 不存在。其关系可能已被移除。");
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return Result.Conflict("Drive 尚未就绪。");
        }

        if (drive.RelationType != DriveRelationType.Ownership)
        {
            return Result.Forbidden("当前 Cinereel 不持有该 Drive 的写权限。");
        }

        if (IsReservedPath(path.Value))
        {
            return Result.Forbidden("目标位于 /.cinereel 协议保留目录。");
        }

        try
        {
            var resultCode = await hyperClient.DeleteFileAsync(
                driveKey,
                path,
                cancellationToken);

            return resultCode switch
            {
                HyperDeleteFileResultCode.Deleted => Result.NoContent(),
                HyperDeleteFileResultCode.NotFound => Result.NotFound("目标文件不存在。"),
                HyperDeleteFileResultCode.DriveNotWritable =>
                    Result.Forbidden(HyperDriveWriteKeyUnavailableMessage),
                _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
            };
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            logger.LogWarning(
                exception,
                "从 Drive {DriveId} 删除文件 {Path} 失败，内容服务暂不可用。",
                driveId,
                path.Value);
            return Result.CriticalError("Drive 内容暂不可用。请稍后重试。");
        }
    }

    public async Task<Result> DeleteDirectoryAsync(
        DriveId driveId,
        DriveDirectoryPath path,
        CancellationToken cancellationToken)
    {
        ValidateDirectoryPath(path);
        var drive = await FindVisibleDriveAsync(driveId, cancellationToken);

        if (drive is null)
        {
            return Result.NotFound("Drive 不存在。其关系可能已被移除。");
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return Result.Conflict("Drive 尚未就绪。");
        }

        if (drive.RelationType != DriveRelationType.Ownership)
        {
            return Result.Forbidden("当前 Cinereel 不持有该 Drive 的写权限。");
        }

        if (IsReservedPath(path.Value))
        {
            return Result.Forbidden("目标位于 /.cinereel 协议保留目录。");
        }

        try
        {
            var resultCode = await hyperClient.DeleteDirectoryAsync(
                driveKey,
                path,
                cancellationToken);

            return resultCode switch
            {
                HyperDeleteDirectoryResultCode.Deleted => Result.NoContent(),
                HyperDeleteDirectoryResultCode.DriveNotWritable =>
                    Result.Forbidden(HyperDriveWriteKeyUnavailableMessage),
                _ => throw new ArgumentOutOfRangeException(nameof(resultCode))
            };
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            logger.LogWarning(
                exception,
                "递归删除 Drive {DriveId} 的目录 {Path} 失败，内容服务暂不可用。",
                driveId,
                path.Value);
            return Result.CriticalError("Drive 内容暂不可用。请稍后重试。");
        }
    }

    private async Task<DriveEntity?> FindVisibleDriveAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(
            driveId.Value,
            cancellationToken);

        return drive is null ||
            drive.RelationType == DriveRelationType.None ||
            drive.Status == DriveStatus.Deleted
                ? null
                : drive;
    }

    private static bool TryGetReadyDriveKey(DriveEntity drive, out DriveKey driveKey)
    {
        driveKey = default;

        if (drive.Status != DriveStatus.Ready)
        {
            return false;
        }

        if (!DriveKey.TryCreate(drive.Key, out driveKey))
        {
            throw new InvalidOperationException(
                $"Ready Drive {drive.Id:D} 缺少有效的 DriveKey。");
        }

        return true;
    }

    private static bool IsReservedPath(string path) =>
        string.Equals(path, "/.cinereel", StringComparison.Ordinal) ||
        path.StartsWith("/.cinereel/", StringComparison.Ordinal);

    private static string GetFileName(DriveFilePath path)
    {
        var separator = path.Value.LastIndexOf('/');
        return path.Value[(separator + 1)..];
    }

    private static void ValidateFilePath(DriveFilePath path)
    {
        if (!DriveFilePath.TryCreate(path.Value, out _))
        {
            throw new ArgumentException("path 必须是规范的 Drive 绝对文件路径。", nameof(path));
        }
    }

    private static void ValidateDirectoryPath(DriveDirectoryPath path)
    {
        if (!DriveDirectoryPath.TryCreate(path.Value, out _))
        {
            throw new ArgumentException("path 必须是规范的 Drive 绝对目录路径。", nameof(path));
        }
    }

    private static bool ContainsFileSizeLimitExceeded(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is DriveFileSizeLimitExceededException)
            {
                return true;
            }
        }

        return false;
    }

    private sealed class DriveFileSizeLimitExceededException(long maxFileSize) : IOException(
        $"Drive 文件不能超过 {maxFileSize} 字节。")
    {
    }

    private sealed class FileSizeLimitedReadStream(Stream inner, long maxFileSize) : Stream
    {
        private readonly byte[] overflowProbe = new byte[1];
        private long totalBytesRead;

        public override bool CanRead => inner.CanRead;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override void Flush()
        {
        }

        public override int Read(byte[] buffer, int offset, int count) =>
            Read(buffer.AsSpan(offset, count));

        public override int Read(Span<byte> buffer)
        {
            if (buffer.IsEmpty)
            {
                return 0;
            }

            if (totalBytesRead == maxFileSize)
            {
                return ProbeForOverflow();
            }

            var allowedCount = (int)Math.Min(
                buffer.Length,
                maxFileSize - totalBytesRead);
            var bytesRead = inner.Read(buffer[..allowedCount]);
            totalBytesRead += bytesRead;
            return bytesRead;
        }

        public override int ReadByte()
        {
            if (totalBytesRead == maxFileSize)
            {
                var value = inner.ReadByte();

                if (value >= 0)
                {
                    throw new DriveFileSizeLimitExceededException(maxFileSize);
                }

                return -1;
            }

            var result = inner.ReadByte();

            if (result >= 0)
            {
                totalBytesRead++;
            }

            return result;
        }

        public override Task<int> ReadAsync(
            byte[] buffer,
            int offset,
            int count,
            CancellationToken cancellationToken) =>
            ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

        public override async ValueTask<int> ReadAsync(
            Memory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            if (buffer.IsEmpty)
            {
                return 0;
            }

            if (totalBytesRead == maxFileSize)
            {
                return await ProbeForOverflowAsync(cancellationToken);
            }

            var allowedCount = (int)Math.Min(
                buffer.Length,
                maxFileSize - totalBytesRead);
            var bytesRead = await inner.ReadAsync(
                buffer[..allowedCount],
                cancellationToken);
            totalBytesRead += bytesRead;
            return bytesRead;
        }

        public override long Seek(long offset, SeekOrigin origin) =>
            throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) =>
            throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
        }

        public override ValueTask DisposeAsync() => ValueTask.CompletedTask;

        private int ProbeForOverflow()
        {
            if (inner.Read(overflowProbe, 0, overflowProbe.Length) != 0)
            {
                throw new DriveFileSizeLimitExceededException(maxFileSize);
            }

            return 0;
        }

        private async ValueTask<int> ProbeForOverflowAsync(
            CancellationToken cancellationToken)
        {
            if (await inner.ReadAsync(overflowProbe, cancellationToken) != 0)
            {
                throw new DriveFileSizeLimitExceededException(maxFileSize);
            }

            return 0;
        }
    }
}
