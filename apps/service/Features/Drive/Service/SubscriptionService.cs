using Ardalis.Result;
using Cinereel.Infrastructure.Persistence;

namespace Cinereel.Features.Drive;

internal sealed class SubscriptionService(
    IDriveRepository driveRepository,
    IUnitOfWork unitOfWork,
    IDriveManifestService manifestService,
    DriveCreationLock creationLock,
    TimeProvider timeProvider) : ISubscriptionService
{
    public async Task<Result<DriveDescriptionResponse>> CreateAsync(
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
            return Result<DriveDescriptionResponse>.Conflict(
                "该 Drive 已由当前 Cinereel 持有或已经删除，不能建立订阅。");
        }

        if (drive?.RelationType == DriveRelationType.Subscription)
        {
            return Result<DriveDescriptionResponse>.Success(DriveDescriptionService.ToResponse(drive));
        }

        var read = await manifestService.ReadAsync(driveKey, cancellationToken);
        if (read.ResultCode != ReadDriveManifestResultCode.Success)
        {
            return MapManifestFailure(read.ResultCode);
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
        return Result<DriveDescriptionResponse>.Created(DriveDescriptionService.ToResponse(drive));
    }

    public async Task<Result<DriveDescriptionResponse>> RefreshAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!TryGetSubscriptionKey(drive, out var driveKey))
        {
            return Result<DriveDescriptionResponse>.NotFound("Subscription 不存在。");
        }

        using var lease = await creationLock.AcquireAsync(
            GetLockKey(driveKey), cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!TryGetSubscriptionKey(drive, out driveKey))
        {
            return Result<DriveDescriptionResponse>.NotFound("Subscription 不存在。");
        }

        var read = await manifestService.ReadAsync(driveKey, cancellationToken);
        if (read.ResultCode != ReadDriveManifestResultCode.Success)
        {
            return MapManifestFailure(read.ResultCode);
        }

        ApplyManifest(drive!, read.Manifest!, GetUtcNow());
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<DriveDescriptionResponse>.Success(DriveDescriptionService.ToResponse(drive!));
    }

    public async Task<Result> DeleteAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!TryGetSubscriptionKey(drive, out var driveKey))
        {
            return Result.NotFound("Subscription 不存在。");
        }

        using var lease = await creationLock.AcquireAsync(
            GetLockKey(driveKey), cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!TryGetSubscriptionKey(drive, out _))
        {
            return Result.NotFound("Subscription 不存在。");
        }

        drive!.RelationType = DriveRelationType.None;
        drive.Remark = null;
        drive.UpdatedAt = GetUtcNow();
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.NoContent();
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

    private static Result<DriveDescriptionResponse> MapManifestFailure(ReadDriveManifestResultCode code) => code switch
    {
        ReadDriveManifestResultCode.NotFound => Result<DriveDescriptionResponse>.Invalid(
            new ValidationError("manifest", "DriveManifest 不存在。")),
        ReadDriveManifestResultCode.Invalid => Result<DriveDescriptionResponse>.Invalid(
            new ValidationError("manifest", "DriveManifest 无效。")),
        ReadDriveManifestResultCode.TooLarge => Result<DriveDescriptionResponse>.Invalid(
            new ValidationError("manifest", "DriveManifest 不能超过 64 KiB。")),
        ReadDriveManifestResultCode.UnsupportedSchema => Result<DriveDescriptionResponse>.Invalid(
            new ValidationError("manifest", "DriveManifest Schema 版本不受支持。")),
        ReadDriveManifestResultCode.UnsupportedContentType => Result<DriveDescriptionResponse>.Invalid(
            new ValidationError("manifest", "DriveManifest 内容类型不受支持。")),
        ReadDriveManifestResultCode.Unavailable => Result<DriveDescriptionResponse>.CriticalError(
            "Drive 内容暂不可用，请稍后重试。"),
        ReadDriveManifestResultCode.Timeout => Result<DriveDescriptionResponse>.CriticalError(
            "读取 DriveManifest 超时，请稍后重试。"),
        _ => throw new ArgumentOutOfRangeException(nameof(code))
    };
}
