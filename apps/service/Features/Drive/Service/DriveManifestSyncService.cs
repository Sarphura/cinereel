using Cinereel.Infrastructure.Persistence;

namespace Cinereel.Features.Drive;

internal sealed class DriveManifestSyncService(
    IDriveRepository driveRepository,
    IUnitOfWork unitOfWork,
    IDriveManifestService manifestService,
    DriveCreationLock creationLock,
    TimeProvider timeProvider,
    ILogger<DriveManifestSyncService> logger)
{
    internal async Task ProcessPendingAsync(CancellationToken cancellationToken)
    {
        var pending = await driveRepository.FindPendingManifestSyncAsync(
            timeProvider.GetUtcNow(), cancellationToken);
        var ids = pending.Select(drive => drive.Id).ToArray();
        foreach (var id in ids)
        {
            try
            {
                await SynchronizeAsync(id, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "同步 Drive {DriveId} 的公开描述失败。", id);
                unitOfWork.ClearTrackedEntities();
            }
        }
    }

    private async Task SynchronizeAsync(Guid id, CancellationToken cancellationToken)
    {
        unitOfWork.ClearTrackedEntities();
        var drive = await driveRepository.FindByIdAsync(id, cancellationToken);
        if (!IsPending(drive)) return;

        using var lease = await creationLock.AcquireAsync(
            drive!.IdempotencyKey ?? throw new InvalidOperationException("自有 Drive 缺少创建幂等键。"),
            cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(id, cancellationToken);
        if (!IsPending(drive)) return;
        if (!DriveKey.TryCreate(drive!.Key, out var driveKey))
            throw new InvalidOperationException("Ready Drive 缺少有效 DriveKey。");

        var manifest = new DriveManifest(1, drive.Name, drive.ContentTypeId, drive.Description,
            drive.ManifestCreatedAt, drive.ManifestUpdatedAt);
        string? error;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            error = await WriteCurrentAsync(driveKey, manifest, timeout.Token);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            error = "manifest_timeout";
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Drive {DriveId} 的 Manifest I/O 暂不可用。", id);
            error = "manifest_unavailable";
        }

        // SQLite 确认失败仍保留待同步版本，下次条件替换后再确认。
        drive.ManifestErrorCode = error;
        if (error is null)
        {
            drive.ManifestSyncedRevision = drive.ManifestRevision;
            drive.ManifestAttempts = 0;
            drive.ManifestNextAttemptAt = null;
        }
        else
        {
            drive.ManifestAttempts = Math.Min(drive.ManifestAttempts + 1, 30);
            var delaySeconds = Math.Min(300, 5 * Math.Pow(2, Math.Min(drive.ManifestAttempts - 1, 6)));
            drive.ManifestNextAttemptAt = timeProvider.GetUtcNow().AddSeconds(delaySeconds);
        }
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<string?> WriteCurrentAsync(
        DriveKey driveKey, DriveManifest desired, CancellationToken cancellationToken)
    {
        var current = await manifestService.ReadAsync(driveKey, cancellationToken);
        if (current.ResultCode == ReadDriveManifestResultCode.Success)
        {
            if (current.Manifest!.HasUnknownFields) return "manifest_unknown_fields";
            // 即使内容相同也推进远端 ETag，使仍在途的旧条件写入无法迟到覆盖。
        }
        else if (current.ResultCode != ReadDriveManifestResultCode.NotFound)
        {
            return current.ResultCode switch
            {
                ReadDriveManifestResultCode.Invalid => "manifest_invalid",
                ReadDriveManifestResultCode.TooLarge => "manifest_too_large",
                ReadDriveManifestResultCode.UnsupportedSchema => "manifest_unsupported_schema",
                ReadDriveManifestResultCode.UnsupportedContentType => "manifest_unsupported_content_type",
                ReadDriveManifestResultCode.Timeout => "manifest_timeout",
                _ => "manifest_unavailable"
            };
        }

        var result = await manifestService.WriteAsync(driveKey, desired, current.ETag, cancellationToken);
        return result.ResultCode switch
        {
            WriteDriveManifestResultCode.Written => null,
            WriteDriveManifestResultCode.Conflict => "manifest_conflict",
            WriteDriveManifestResultCode.NotWritable => "manifest_not_writable",
            WriteDriveManifestResultCode.Invalid => "manifest_invalid",
            WriteDriveManifestResultCode.TooLarge => "manifest_too_large",
            WriteDriveManifestResultCode.UnknownFields => "manifest_unknown_fields",
            WriteDriveManifestResultCode.TargetConflict => "manifest_target_conflict",
            WriteDriveManifestResultCode.Timeout => "manifest_timeout",
            _ => "manifest_unavailable"
        };
    }

    private bool IsPending(DriveEntity? drive) => drive is not null &&
        drive.RelationType == DriveRelationType.Ownership && drive.Status == DriveStatus.Ready &&
        drive.ManifestRevision > drive.ManifestSyncedRevision &&
        (drive.ManifestNextAttemptAt is null || drive.ManifestNextAttemptAt <= timeProvider.GetUtcNow());
}
