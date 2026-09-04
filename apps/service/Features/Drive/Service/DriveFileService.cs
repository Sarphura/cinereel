namespace Cinereel.Features.Drive;

internal sealed class DriveFileService(
    IDriveRepository driveRepository,
    IHyperClient hyperClient,
    ILogger<DriveFileService> logger) : IDriveFileService
{
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

    public async Task<ListDriveDirectoryResult> ListDirectoryAsync(
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
            return new ListDriveDirectoryResult(
                ListDriveDirectoryResultCode.DriveNotFound,
                null);
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return new ListDriveDirectoryResult(
                ListDriveDirectoryResultCode.DriveNotReady,
                null);
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
                return new ListDriveDirectoryResult(
                    ListDriveDirectoryResultCode.VersionConflict,
                    null);
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
            return new ListDriveDirectoryResult(
                ListDriveDirectoryResultCode.Listed,
                response);
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
            return new ListDriveDirectoryResult(
                ListDriveDirectoryResultCode.ContentUnavailable,
                null);
        }
    }

    public async Task<AddDriveFileResultCode> AddFileAsync(
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
            return AddDriveFileResultCode.DriveNotFound;
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return AddDriveFileResultCode.DriveNotReady;
        }

        if (drive.RelationType != DriveRelationType.Ownership)
        {
            return AddDriveFileResultCode.WriteNotAllowed;
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
                HyperAddFileResultCode.Created => AddDriveFileResultCode.Created,
                HyperAddFileResultCode.AlreadyExists => AddDriveFileResultCode.AlreadyExists,
                HyperAddFileResultCode.DriveNotWritable =>
                    AddDriveFileResultCode.WriteNotAllowed,
                HyperAddFileResultCode.FileTooLarge => AddDriveFileResultCode.FileTooLarge,
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
            return AddDriveFileResultCode.FileTooLarge;
        }
        catch (Exception exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            logger.LogWarning(
                exception,
                "向 Drive {DriveId} 增加文件 {Path} 失败，内容服务暂不可用。",
                driveId,
                path.Value);
            return AddDriveFileResultCode.ContentUnavailable;
        }
    }

    public async Task<DeleteDriveFileResultCode> DeleteFileAsync(
        DriveId driveId,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        ValidateFilePath(path);
        var drive = await FindVisibleDriveAsync(driveId, cancellationToken);

        if (drive is null)
        {
            return DeleteDriveFileResultCode.DriveNotFound;
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return DeleteDriveFileResultCode.DriveNotReady;
        }

        if (drive.RelationType != DriveRelationType.Ownership)
        {
            return DeleteDriveFileResultCode.WriteNotAllowed;
        }

        try
        {
            var resultCode = await hyperClient.DeleteFileAsync(
                driveKey,
                path,
                cancellationToken);

            return resultCode switch
            {
                HyperDeleteFileResultCode.Deleted => DeleteDriveFileResultCode.Deleted,
                HyperDeleteFileResultCode.NotFound => DeleteDriveFileResultCode.FileNotFound,
                HyperDeleteFileResultCode.DriveNotWritable =>
                    DeleteDriveFileResultCode.WriteNotAllowed,
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
            return DeleteDriveFileResultCode.ContentUnavailable;
        }
    }

    public async Task<DeleteDriveDirectoryResultCode> DeleteDirectoryAsync(
        DriveId driveId,
        DriveDirectoryPath path,
        CancellationToken cancellationToken)
    {
        ValidateDirectoryPath(path);
        var drive = await FindVisibleDriveAsync(driveId, cancellationToken);

        if (drive is null)
        {
            return DeleteDriveDirectoryResultCode.DriveNotFound;
        }

        if (!TryGetReadyDriveKey(drive, out var driveKey))
        {
            return DeleteDriveDirectoryResultCode.DriveNotReady;
        }

        if (drive.RelationType != DriveRelationType.Ownership)
        {
            return DeleteDriveDirectoryResultCode.WriteNotAllowed;
        }

        try
        {
            var resultCode = await hyperClient.DeleteDirectoryAsync(
                driveKey,
                path,
                cancellationToken);

            return resultCode switch
            {
                HyperDeleteDirectoryResultCode.Deleted =>
                    DeleteDriveDirectoryResultCode.Deleted,
                HyperDeleteDirectoryResultCode.DriveNotWritable =>
                    DeleteDriveDirectoryResultCode.WriteNotAllowed,
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
            return DeleteDriveDirectoryResultCode.ContentUnavailable;
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
