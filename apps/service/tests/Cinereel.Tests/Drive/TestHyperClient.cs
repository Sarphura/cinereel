using System.Security.Cryptography;
using System.Text;
using Cinereel.Features.Drive;

namespace Cinereel.Tests.Drive;

internal sealed class TestHyperClient : IHyperClient
{
    private readonly Func<DriveId, DriveKey> _createDriveKey;

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

    internal HyperDeleteFileResultCode DeleteFileResult { get; set; } =
        HyperDeleteFileResultCode.Deleted;

    internal HyperDeleteDirectoryResultCode DeleteDirectoryResult { get; set; } =
        HyperDeleteDirectoryResultCode.Deleted;

    internal Exception? ListDirectoryException { get; set; }

    internal Exception? AddFileException { get; set; }

    internal Exception? DeleteFileException { get; set; }

    internal Exception? DeleteDirectoryException { get; set; }

    internal Action? BeforeFileOperation { get; set; }

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
        DeleteFileCalls.Clear();
        DeleteDirectoryCalls.Clear();
        ListDirectoryResult = null;
        AddFileResult = HyperAddFileResultCode.Created;
        DeleteFileResult = HyperDeleteFileResultCode.Deleted;
        DeleteDirectoryResult = HyperDeleteDirectoryResultCode.Deleted;
        ListDirectoryException = null;
        AddFileException = null;
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
