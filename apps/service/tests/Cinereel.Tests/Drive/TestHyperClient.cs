using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Cinereel.Features.Drive;

namespace Cinereel.Tests.Drive;

internal sealed class TestHyperClient : IHyperClient
{
    private readonly Func<DriveId, DriveKey> _createDriveKey;
    private readonly object protocolFilesLock = new();
    private readonly Dictionary<(DriveKey DriveKey, string Path), HyperReadProtocolFileResult>
        protocolFiles = [];
    private long protocolVersion;

    internal TestHyperClient()
        : this(CreateDriveKey)
    {
    }

    internal TestHyperClient(DriveKey createdDriveKey)
        : this(_ => createdDriveKey)
    {
    }

    private TestHyperClient(Func<DriveId, DriveKey> createDriveKey)
    {
        _createDriveKey = createDriveKey;
    }

    internal List<(DriveId DriveId, DriveName Name)> CreateCalls { get; } = [];

    internal List<DriveKey> DeleteCalls { get; } = [];

    internal List<(
        DriveKey DriveKey,
        DriveDirectoryPath Path,
        string? Cursor,
        int Limit)> ListDirectoryCalls
    { get; } = [];

    internal List<(
        DriveKey DriveKey,
        DriveFilePath Path,
        byte[] Content)> AddFileCalls
    { get; } = [];

    internal List<(DriveKey DriveKey, DriveFilePath Path)> ReadFileCalls { get; } = [];

    internal List<(DriveKey DriveKey, DriveFilePath Path)> DeleteFileCalls { get; } = [];

    internal List<(
        DriveKey DriveKey,
        DriveDirectoryPath Path)> DeleteDirectoryCalls
    { get; } = [];

    internal Exception? CreateException { get; set; }

    internal Exception? DeleteException { get; set; }

    internal HyperDirectoryPage? ListDirectoryResult { get; set; }

    internal HyperAddFileResultCode AddFileResult { get; set; } =
        HyperAddFileResultCode.Created;

    internal HyperReadFileResult? ReadFileResult { get; set; }

    internal HyperDeleteFileResultCode DeleteFileResult { get; set; } =
        HyperDeleteFileResultCode.Deleted;

    internal HyperDeleteDirectoryResultCode DeleteDirectoryResult { get; set; } =
        HyperDeleteDirectoryResultCode.Deleted;

    internal Exception? ListDirectoryException { get; set; }

    internal Exception? AddFileException { get; set; }

    internal Exception? ReadFileException { get; set; }

    internal Exception? DeleteFileException { get; set; }

    internal Exception? DeleteDirectoryException { get; set; }

    internal Action? BeforeFileOperation { get; set; }

    internal ConcurrentQueue<(DriveKey DriveKey, DriveFilePath Path)> ReadProtocolFileCalls
    { get; } = new();

    internal ConcurrentQueue<(
        DriveKey DriveKey,
        DriveFilePath Path,
        byte[] Content,
        string? ExpectedETag)> WriteProtocolFileCalls
    { get; } = new();

    internal HyperReadProtocolFileResult? ReadProtocolFileResult { get; set; }

    internal HyperWriteProtocolFileResult? WriteProtocolFileResult { get; set; }

    internal Exception? ReadProtocolFileException { get; set; }

    internal Exception? WriteProtocolFileException { get; set; }

    internal Func<CancellationToken, Task>? BeforeProtocolRead { get; set; }

    internal Func<CancellationToken, Task>? BeforeProtocolWrite { get; set; }

    internal Func<CancellationToken, Task>? AfterProtocolWrite { get; set; }

    internal void SetProtocolFile(
        DriveKey driveKey,
        byte[] content,
        string path = DriveManifest.Path)
    {
        lock (protocolFilesLock)
        {
            var version = ++protocolVersion;
            protocolFiles[(driveKey, path)] = new(
                HyperReadProtocolFileResultCode.Success,
                content.ToArray(),
                $"\"{version}\"",
                version);
        }
    }

    internal HyperReadProtocolFileResult GetProtocolFile(
        DriveKey driveKey,
        string path = DriveManifest.Path)
    {
        lock (protocolFilesLock)
        {
            return protocolFiles.TryGetValue((driveKey, path), out var result)
                ? result with { Content = result.Content!.ToArray() }
                : new(HyperReadProtocolFileResultCode.NotFound);
        }
    }

    public async Task<HyperReadProtocolFileResult> ReadProtocolFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ReadProtocolFileCalls.Enqueue((driveKey, path));
        if (BeforeProtocolRead is not null)
        {
            await BeforeProtocolRead(cancellationToken);
        }

        if (ReadProtocolFileException is not null)
        {
            throw ReadProtocolFileException;
        }

        return ReadProtocolFileResult ?? GetProtocolFile(driveKey, path.Value);
    }

    public async Task<HyperWriteProtocolFileResult> WriteProtocolFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        ReadOnlyMemory<byte> content,
        string? expectedETag,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        WriteProtocolFileCalls.Enqueue((driveKey, path, content.ToArray(), expectedETag));
        if (BeforeProtocolWrite is not null)
        {
            await BeforeProtocolWrite(cancellationToken);
        }

        if (WriteProtocolFileException is not null)
        {
            throw WriteProtocolFileException;
        }

        if (WriteProtocolFileResult is not null)
        {
            return WriteProtocolFileResult;
        }

        HyperWriteProtocolFileResult result;
        lock (protocolFilesLock)
        {
            var existing = GetProtocolFile(driveKey, path.Value);
            if ((expectedETag is null && existing.ResultCode != HyperReadProtocolFileResultCode.NotFound) ||
                (expectedETag is not null && existing.ETag != expectedETag))
            {
                return new(HyperWriteProtocolFileResultCode.Conflict);
            }

            SetProtocolFile(driveKey, content.ToArray(), path.Value);
            var written = GetProtocolFile(driveKey, path.Value);
            result = new(HyperWriteProtocolFileResultCode.Written, written.ETag, written.DriveVersion);
        }

        if (AfterProtocolWrite is not null)
        {
            await AfterProtocolWrite(cancellationToken);
        }

        return result;
    }

    public Task<DriveKey> EnsureDriveAsync(
        DriveId driveId,
        DriveName name,
        CancellationToken cancellationToken)
    {
        CreateCalls.Add((driveId, name));

        return CreateException is null
            ? Task.FromResult(_createDriveKey(driveId))
            : Task.FromException<DriveKey>(CreateException);
    }

    public Task DeleteAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken)
    {
        DeleteCalls.Add(driveKey);

        return DeleteException is null
            ? Task.CompletedTask
            : Task.FromException(DeleteException);
    }

    public Task<HyperDirectoryPage> ListDirectoryAsync(
        DriveKey driveKey,
        DriveDirectoryPath path,
        string? cursor,
        int limit,
        CancellationToken cancellationToken)
    {
        ListDirectoryCalls.Add((driveKey, path, cursor, limit));
        BeforeFileOperation?.Invoke();

        if (ListDirectoryException is not null)
        {
            return Task.FromException<HyperDirectoryPage>(ListDirectoryException);
        }

        return Task.FromResult(ListDirectoryResult ?? new HyperDirectoryPage(
            path.Value,
            0,
            [],
            null));
    }

    public async Task<HyperAddFileResultCode> AddFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        Stream content,
        CancellationToken cancellationToken)
    {
        BeforeFileOperation?.Invoke();

        if (AddFileException is not null)
        {
            throw AddFileException;
        }

        await using var copy = new MemoryStream();
        await content.CopyToAsync(copy, cancellationToken);
        AddFileCalls.Add((driveKey, path, copy.ToArray()));

        return AddFileResult;
    }

    public Task<HyperReadFileResult> ReadFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ReadFileCalls.Add((driveKey, path));
        BeforeFileOperation?.Invoke();

        if (ReadFileException is not null)
        {
            return Task.FromException<HyperReadFileResult>(ReadFileException);
        }

        return Task.FromResult(ReadFileResult ?? new(
            HyperReadFileResultCode.Success,
            new MemoryStream([], writable: false),
            "application/octet-stream",
            0));
    }

    public Task<HyperDeleteFileResultCode> DeleteFileAsync(
        DriveKey driveKey,
        DriveFilePath path,
        CancellationToken cancellationToken)
    {
        DeleteFileCalls.Add((driveKey, path));
        BeforeFileOperation?.Invoke();

        return DeleteFileException is null
            ? Task.FromResult(DeleteFileResult)
            : Task.FromException<HyperDeleteFileResultCode>(DeleteFileException);
    }

    public Task<HyperDeleteDirectoryResultCode> DeleteDirectoryAsync(
        DriveKey driveKey,
        DriveDirectoryPath path,
        CancellationToken cancellationToken)
    {
        DeleteDirectoryCalls.Add((driveKey, path));
        BeforeFileOperation?.Invoke();

        return DeleteDirectoryException is null
            ? Task.FromResult(DeleteDirectoryResult)
            : Task.FromException<HyperDeleteDirectoryResultCode>(DeleteDirectoryException);
    }

    internal void ResetFileOperations()
    {
        ListDirectoryCalls.Clear();
        AddFileCalls.Clear();
        ReadFileCalls.Clear();
        DeleteFileCalls.Clear();
        DeleteDirectoryCalls.Clear();
        ListDirectoryResult = null;
        AddFileResult = HyperAddFileResultCode.Created;
        ReadFileResult = null;
        DeleteFileResult = HyperDeleteFileResultCode.Deleted;
        DeleteDirectoryResult = HyperDeleteDirectoryResultCode.Deleted;
        ListDirectoryException = null;
        AddFileException = null;
        ReadFileException = null;
        DeleteFileException = null;
        DeleteDirectoryException = null;
        BeforeFileOperation = null;
    }

    private static DriveKey CreateDriveKey(DriveId driveId)
    {
        var value = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(driveId.ToString())))
            .ToLowerInvariant();
        DriveKey.TryCreate(value, out var driveKey);
        return driveKey;
    }
}
