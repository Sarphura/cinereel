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

    internal Exception? CreateException { get; set; }

    internal Exception? DeleteException { get; set; }

    public Task<DriveKey> CreateAsync(
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

    private static DriveKey CreateDriveKey(DriveId driveId)
    {
        var value = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(driveId.ToString())))
            .ToLowerInvariant();
        DriveKey.TryCreate(value, out var driveKey);
        return driveKey;
    }
}
