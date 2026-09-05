using Cinereel.Infrastructure.Persistence;

namespace Cinereel.Features.Drive;

internal sealed class SubscriptionService(
    IDriveRepository driveRepository,
    IUnitOfWork unitOfWork,
    IDriveManifestService manifestService,
    DriveCreationLock creationLock,
    TimeProvider timeProvider) : ISubscriptionService
{
    public async Task<CreateSubscriptionResult> CreateAsync(
        DriveKey driveKey,
        CancellationToken cancellationToken)
    {
        if (!DriveKey.TryCreate(driveKey.Value, out _))
        {
            throw new ArgumentException("driveKey 无效。", nameof(driveKey));
        }

        using var lease = await creationLock.AcquireAsync(
            GetLockKey(driveKey), cancellationToken);
        unitOfWork.ClearTrackedEntities();
        var drive = await driveRepository.FindByKeyAsync(driveKey.Value, cancellationToken);

        if (drive is not null &&
            (drive.Status != DriveStatus.Ready || drive.RelationType == DriveRelationType.Ownership))
        {
            return new(CreateSubscriptionResultCode.RelationshipConflict);
        }

        if (drive?.RelationType == DriveRelationType.Subscription)
        {
            return new(CreateSubscriptionResultCode.Replayed, DriveDescriptionService.ToResponse(drive));
        }

        var read = await manifestService.ReadAsync(driveKey, cancellationToken);
        if (read.ResultCode != ReadDriveManifestResultCode.Success)
        {
            return new(ToCreateFailureCode(read.ResultCode));
        }

        var now = GetUtcNow();
        if (drive is null)
        {
            drive = new DriveEntity
            {
                Id = DriveId.New().Value,
                Key = driveKey.Value,
                CreatedAt = now
            };
            driveRepository.Add(drive);
        }

        ApplyManifest(drive, read.Manifest!, now);
        drive.Status = DriveStatus.Ready;
        drive.RelationType = DriveRelationType.Subscription;
        drive.Remark = null;
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new(CreateSubscriptionResultCode.Created, DriveDescriptionService.ToResponse(drive));
    }

    public async Task<RefreshSubscriptionResult> RefreshAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!TryGetSubscriptionKey(drive, out var driveKey))
        {
            return new(RefreshSubscriptionResultCode.NotFound);
        }

        using var lease = await creationLock.AcquireAsync(
            GetLockKey(driveKey), cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!TryGetSubscriptionKey(drive, out driveKey))
        {
            return new(RefreshSubscriptionResultCode.NotFound);
        }

        var read = await manifestService.ReadAsync(driveKey, cancellationToken);
        if (read.ResultCode != ReadDriveManifestResultCode.Success)
        {
            return new(ToRefreshFailureCode(read.ResultCode));
        }

        ApplyManifest(drive!, read.Manifest!, GetUtcNow());
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new(RefreshSubscriptionResultCode.Refreshed, DriveDescriptionService.ToResponse(drive!));
    }

    public async Task<DeleteSubscriptionResultCode> DeleteAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!TryGetSubscriptionKey(drive, out var driveKey))
        {
            return DeleteSubscriptionResultCode.NotFound;
        }

        using var lease = await creationLock.AcquireAsync(
            GetLockKey(driveKey), cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!TryGetSubscriptionKey(drive, out _))
        {
            return DeleteSubscriptionResultCode.NotFound;
        }

        drive!.RelationType = DriveRelationType.None;
        drive.Remark = null;
        drive.UpdatedAt = GetUtcNow();
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return DeleteSubscriptionResultCode.Deleted;
    }

    private static void ApplyManifest(DriveEntity drive, DriveManifest manifest, DateTimeOffset now)
    {
        drive.Name = manifest.Name;
        drive.ContentTypeId = manifest.ContentTypeId;
        drive.Description = manifest.Description;
        drive.ManifestCreatedAt = manifest.CreatedAt;
        drive.ManifestUpdatedAt = manifest.UpdatedAt;
        drive.ManifestRevision = 0;
        drive.ManifestSyncedRevision = 0;
        drive.ManifestErrorCode = null;
        drive.ManifestAttempts = 0;
        drive.ManifestNextAttemptAt = null;
        drive.UpdatedAt = now;
    }

    private static bool TryGetSubscriptionKey(DriveEntity? drive, out DriveKey driveKey)
    {
        driveKey = default;
        if (drive?.RelationType != DriveRelationType.Subscription || drive.Status != DriveStatus.Ready)
        {
            return false;
        }

        if (!DriveKey.TryCreate(drive.Key, out driveKey))
        {
            throw new InvalidOperationException($"Subscription Drive {drive.Id:D} 缺少有效的 DriveKey。");
        }

        return true;
    }

    private static string GetLockKey(DriveKey driveKey) => "subscription:" + driveKey.Value;

    private DateTimeOffset GetUtcNow() => DateTimeOffset.FromUnixTimeMilliseconds(
        timeProvider.GetUtcNow().ToUnixTimeMilliseconds());

    private static CreateSubscriptionResultCode ToCreateFailureCode(ReadDriveManifestResultCode code) => code switch
    {
        ReadDriveManifestResultCode.NotFound => CreateSubscriptionResultCode.ManifestMissing,
        ReadDriveManifestResultCode.Invalid => CreateSubscriptionResultCode.InvalidManifest,
        ReadDriveManifestResultCode.TooLarge => CreateSubscriptionResultCode.ManifestTooLarge,
        ReadDriveManifestResultCode.UnsupportedSchema => CreateSubscriptionResultCode.UnsupportedSchema,
        ReadDriveManifestResultCode.UnsupportedContentType => CreateSubscriptionResultCode.UnsupportedContentType,
        ReadDriveManifestResultCode.Unavailable => CreateSubscriptionResultCode.ContentUnavailable,
        ReadDriveManifestResultCode.Timeout => CreateSubscriptionResultCode.Timeout,
        _ => throw new ArgumentOutOfRangeException(nameof(code))
    };

    private static RefreshSubscriptionResultCode ToRefreshFailureCode(ReadDriveManifestResultCode code) => code switch
    {
        ReadDriveManifestResultCode.NotFound => RefreshSubscriptionResultCode.ManifestMissing,
        ReadDriveManifestResultCode.Invalid => RefreshSubscriptionResultCode.InvalidManifest,
        ReadDriveManifestResultCode.TooLarge => RefreshSubscriptionResultCode.ManifestTooLarge,
        ReadDriveManifestResultCode.UnsupportedSchema => RefreshSubscriptionResultCode.UnsupportedSchema,
        ReadDriveManifestResultCode.UnsupportedContentType => RefreshSubscriptionResultCode.UnsupportedContentType,
        ReadDriveManifestResultCode.Unavailable => RefreshSubscriptionResultCode.ContentUnavailable,
        ReadDriveManifestResultCode.Timeout => RefreshSubscriptionResultCode.Timeout,
        _ => throw new ArgumentOutOfRangeException(nameof(code))
    };
}
