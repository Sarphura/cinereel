using System.Security.Cryptography;
using System.Text.Json;
using Cinereel.Infrastructure.Persistence;

namespace Cinereel.Features.Drive;

internal sealed class DriveService(
    IDriveRepository driveRepository,
    IUnitOfWork unitOfWork,
    IHyperClient hyperClient,
    DriveCreationLock creationLock,
    TimeProvider timeProvider,
    ILogger<DriveService> logger) : IDriveService
{
    public async Task<CreateDriveResult> CreateAsync(
        IdempotencyKey idempotencyKey,
        CreateDriveRequest request,
        CancellationToken cancellationToken)
    {
        if (!DriveName.TryCreate(request.Name, out var name) ||
            !DriveContentTypeId.TryCreate(request.ContentTypeId, out var contentTypeId))
        {
            throw new ArgumentException("CreateDriveRequest 包含无效字段。", nameof(request));
        }

        using var lease = await creationLock.AcquireAsync(
            idempotencyKey.Value,
            cancellationToken);
        var requestHash = ComputeRequestHash(name, contentTypeId);
        var existing = await driveRepository.FindByIdempotencyKeyAsync(
            idempotencyKey.Value,
            cancellationToken);

        if (existing is not null && !string.Equals(
                existing.CreationRequestHash,
                requestHash,
                StringComparison.Ordinal))
        {
            return new CreateDriveResult(CreateDriveResultCode.IdempotencyConflict, null);
        }

        if (existing?.Status == DriveStatus.Deleted)
        {
            return new CreateDriveResult(CreateDriveResultCode.Gone, null);
        }

        if (existing?.Status == DriveStatus.Ready)
        {
            return new CreateDriveResult(CreateDriveResultCode.Replayed, ToResponse(existing));
        }

        if (existing is not null)
        {
            if (existing.Status == DriveStatus.Failed)
            {
                existing.Status = DriveStatus.Pending;
                existing.Key = null;
                existing.UpdatedAt = GetUtcNow();
                await unitOfWork.SaveChangesAsync(cancellationToken);
            }

            return new CreateDriveResult(CreateDriveResultCode.Accepted, ToResponse(existing));
        }

        var now = GetUtcNow();
        var drive = new DriveEntity
        {
            Id = DriveId.New().Value,
            Name = name.Value,
            ContentTypeId = contentTypeId.Value,
            ManifestRevision = 1,
            ManifestCreatedAt = now,
            ManifestUpdatedAt = now,
            IdempotencyKey = idempotencyKey.Value,
            CreationRequestHash = requestHash,
            Status = DriveStatus.Pending,
            RelationType = DriveRelationType.Ownership,
            CreatedAt = now,
            UpdatedAt = now
        };
        driveRepository.Add(drive);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new CreateDriveResult(CreateDriveResultCode.Accepted, ToResponse(drive));
    }

    public async Task<DriveResponse?> GetAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var entity = await driveRepository.FindByIdAsync(
            driveId.Value,
            cancellationToken);

        if (entity is null || entity.RelationType == DriveRelationType.None)
        {
            return null;
        }

        return ToResponse(entity);
    }

    public async Task<IReadOnlyList<DriveResponse>> ListAsync(
        CancellationToken cancellationToken)
    {
        var drives = await driveRepository.FindAllAsync(cancellationToken);

        return drives
            .Where(drive => drive.RelationType != DriveRelationType.None)
            .OrderBy(drive => drive.CreatedAt)
            .ThenBy(drive => drive.Id)
            .Select(ToResponse)
            .ToArray();
    }

    public async Task<RetryDriveCreationResultCode> RetryCreationAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);

        if (drive is null || drive.RelationType != DriveRelationType.Ownership ||
            drive.Status == DriveStatus.Deleted)
        {
            return RetryDriveCreationResultCode.NotFound;
        }

        if (drive.Status == DriveStatus.Pending)
        {
            return RetryDriveCreationResultCode.Accepted;
        }

        if (drive.Status != DriveStatus.Failed)
        {
            return RetryDriveCreationResultCode.NotFailed;
        }

        var idempotencyKey = drive.IdempotencyKey ?? throw new InvalidOperationException(
            $"Drive {drive.Id:D} 缺少创建幂等键。");
        using var lease = await creationLock.AcquireAsync(idempotencyKey, cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);

        if (drive is null || drive.Status == DriveStatus.Deleted)
        {
            return RetryDriveCreationResultCode.NotFound;
        }

        if (drive.Status == DriveStatus.Ready)
        {
            return RetryDriveCreationResultCode.NotFailed;
        }

        drive.Status = DriveStatus.Pending;
        drive.Key = null;
        drive.UpdatedAt = GetUtcNow();
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return RetryDriveCreationResultCode.Accepted;
    }

    public async Task<UpdateDriveRemarkResultCode> UpdateRemarkAsync(
        DriveId driveId,
        DriveRemark remark,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(
            driveId.Value,
            cancellationToken);

        if (!DriveDescriptionService.IsVisible(drive))
        {
            return UpdateDriveRemarkResultCode.NotFound;
        }

        var lockKey = drive!.RelationType == DriveRelationType.Ownership
            ? drive.IdempotencyKey ?? throw new InvalidOperationException("自有 Drive 缺少创建幂等键。")
            : $"subscription:{drive.Key}";
        using var lease = await creationLock.AcquireAsync(lockKey, cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);
        if (!DriveDescriptionService.IsVisible(drive))
        {
            return UpdateDriveRemarkResultCode.NotFound;
        }

        drive!.Remark = remark.Value;
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return UpdateDriveRemarkResultCode.Updated;
    }

    public async Task<DeleteDriveResultCode> DeleteAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(
            driveId.Value,
            cancellationToken);
        if (drive is null || drive.RelationType != DriveRelationType.Ownership ||
            drive.Status == DriveStatus.Deleted)
        {
            return DeleteDriveResultCode.NotFound;
        }

        var idempotencyKey = drive.IdempotencyKey ?? throw new InvalidOperationException(
            $"Drive {driveId} 缺少创建幂等键。");
        using var lease = await creationLock.AcquireAsync(idempotencyKey, cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId.Value, cancellationToken);

        if (drive is null || drive.RelationType != DriveRelationType.Ownership ||
            drive.Status == DriveStatus.Deleted)
        {
            return DeleteDriveResultCode.NotFound;
        }

        drive.Status = DriveStatus.Deleted;
        drive.RelationType = DriveRelationType.None;
        drive.Remark = null;
        drive.UpdatedAt = GetUtcNow();
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return DeleteDriveResultCode.Deleted;
    }

    internal async Task ProcessPendingCreationsAsync(CancellationToken cancellationToken)
    {
        var driveIds = (await driveRepository.FindAllByStatusAsync(
                DriveStatus.Pending,
                cancellationToken))
            .Select(drive => drive.Id)
            .ToArray();

        foreach (var driveId in driveIds)
        {
            try
            {
                await ProcessPendingCreationAsync(driveId, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "处理 Pending Drive {DriveId} 失败。",
                    driveId);
            }
        }
    }

    private async Task ProcessPendingCreationAsync(
        Guid driveId,
        CancellationToken cancellationToken)
    {
        var drive = await driveRepository.FindByIdAsync(driveId, cancellationToken);

        if (drive?.Status != DriveStatus.Pending)
        {
            return;
        }

        var idempotencyKey = drive.IdempotencyKey ?? throw new InvalidOperationException(
            $"Pending Drive {driveId:D} 缺少创建幂等键。");
        using var lease = await creationLock.AcquireAsync(idempotencyKey, cancellationToken);
        unitOfWork.ClearTrackedEntities();
        drive = await driveRepository.FindByIdAsync(driveId, cancellationToken);

        if (drive?.Status != DriveStatus.Pending)
        {
            return;
        }

        try
        {
            if (!DriveName.TryCreate(drive.Name, out var name))
            {
                throw new InvalidOperationException(
                    $"Pending Drive {driveId:D} 保存了无效的 Name。");
            }

            var driveKey = await hyperClient.EnsureDriveAsync(
                new DriveId(drive.Id),
                name,
                cancellationToken);
            drive.Key = driveKey.Value;
            drive.Status = DriveStatus.Ready;
            drive.UpdatedAt = GetUtcNow();
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            unitOfWork.ClearTrackedEntities();
            drive = await driveRepository.FindByIdAsync(driveId, CancellationToken.None);

            if (drive?.Status == DriveStatus.Pending)
            {
                drive.Status = DriveStatus.Failed;
                drive.UpdatedAt = GetUtcNow();
                await unitOfWork.SaveChangesAsync(CancellationToken.None);
            }

            logger.LogWarning(exception, "创建 Drive {DriveId} 失败。", driveId);
        }
    }

    private static string ComputeRequestHash(
        DriveName name,
        DriveContentTypeId contentTypeId)
    {
        var request = JsonSerializer.SerializeToUtf8Bytes(
            new RequestIdentity(name.Value, contentTypeId.Value));
        return Convert.ToHexString(SHA256.HashData(request)).ToLowerInvariant();
    }

    private DateTimeOffset GetUtcNow()
    {
        var now = timeProvider.GetUtcNow();
        return DateTimeOffset.FromUnixTimeMilliseconds(now.ToUnixTimeMilliseconds());
    }

    private static DriveResponse ToResponse(DriveEntity entity)
    {
        if (!DriveName.TryCreate(entity.Name, out var name) ||
            !DriveContentTypeId.TryCreate(entity.ContentTypeId, out var contentTypeId))
        {
            throw new InvalidOperationException($"Drive {entity.Id:D} 的持久化数据无效。");
        }

        DriveKey? key = null;

        if (entity.Key is not null)
        {
            if (!DriveKey.TryCreate(entity.Key, out var parsedKey))
            {
                throw new InvalidOperationException($"Drive {entity.Id:D} 保存了无效的 DriveKey。");
            }

            key = parsedKey;
        }

        if (entity.Status == DriveStatus.Ready && key is null)
        {
            throw new InvalidOperationException($"Ready Drive {entity.Id:D} 缺少 DriveKey。");
        }

        return new DriveResponse(
            entity.Id,
            key?.Value,
            name.Value,
            contentTypeId.Value,
            entity.Remark,
            ToResponseValue(entity.RelationType),
            ToResponseValue(entity.Status),
            entity.CreatedAt,
            entity.UpdatedAt);
    }

    private static string ToResponseValue(DriveRelationType relationType) => relationType switch
    {
        DriveRelationType.None => throw new ArgumentOutOfRangeException(nameof(relationType)),
        DriveRelationType.Ownership => "ownership",
        DriveRelationType.Subscription => "subscription",
        _ => throw new ArgumentOutOfRangeException(nameof(relationType))
    };

    private static string ToResponseValue(DriveStatus status) => status switch
    {
        DriveStatus.Pending => "pending",
        DriveStatus.Ready => "ready",
        DriveStatus.Failed => "failed",
        DriveStatus.Deleted => "deleted",
        _ => throw new ArgumentOutOfRangeException(nameof(status))
    };

    private sealed record RequestIdentity(string Name, string ContentTypeId);
}
