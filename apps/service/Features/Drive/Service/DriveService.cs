using System.Runtime.ExceptionServices;
using System.Security.Cryptography;
using System.Text.Json;
using Cinereel.Infrastructure.Persistence;

namespace Cinereel.Features.Drive;

internal sealed class DriveService(
    IDriveRepository driveRepository,
    IDriveOwnershipRepository driveOwnershipRepository,
    IDriveCreationOperationRepository operationRepository,
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
        var operation = await GetOrCreateOperationAsync(
            idempotencyKey,
            name,
            contentTypeId,
            requestHash,
            cancellationToken);

        if (!string.Equals(operation.RequestHash, requestHash, StringComparison.Ordinal))
        {
            return new CreateDriveResult(CreateDriveResultCode.IdempotencyConflict, null);
        }

        if (operation.Status == DriveCreationOperationStatus.Tombstoned)
        {
            return new CreateDriveResult(CreateDriveResultCode.Gone, null);
        }

        if (operation.Status == DriveCreationOperationStatus.Completed)
        {
            var replayedDrive = await LoadRequiredDriveAsync(
                operation.DriveId,
                cancellationToken);
            return new CreateDriveResult(CreateDriveResultCode.Replayed, replayedDrive);
        }

        if (operation.Status == DriveCreationOperationStatus.CompensationPending)
        {
            var compensated = await TryCompensateAsync(operation, CancellationToken.None);

            if (!compensated)
            {
                throw new DriveCreationRecoveryPendingException();
            }
        }

        if (operation.Status == DriveCreationOperationStatus.Compensated)
        {
            operation.Status = DriveCreationOperationStatus.Pending;
            operation.DriveKey = null;
            operation.UpdatedAt = GetUtcNow();
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        DriveKey? createdDriveKey = null;

        try
        {
            createdDriveKey = await EnsureHyperDriveCreatedAsync(
                operation,
                name,
                cancellationToken);
            await PersistCompletedDriveAsync(
                operation,
                createdDriveKey.Value,
                cancellationToken);
        }
        catch (Exception exception)
        {
            unitOfWork.ClearTrackedEntities();
            DriveResponse? committedDrive;

            try
            {
                committedDrive = await TryLoadCompletedDriveAsync(
                    operation.IdempotencyKey,
                    CancellationToken.None);
            }
            catch (Exception verificationException)
            {
                logger.LogWarning(
                    verificationException,
                    "无法确认 Drive 创建操作 {IdempotencyKey} 是否已提交，将由恢复任务继续处理。",
                    operation.IdempotencyKey);
                ExceptionDispatchInfo.Capture(exception).Throw();
                throw;
            }

            if (committedDrive is not null)
            {
                return new CreateDriveResult(CreateDriveResultCode.Created, committedDrive);
            }

            if (createdDriveKey is not null)
            {
                try
                {
                    var persistedOperation = await operationRepository.FindByIdAsync(
                        operation.IdempotencyKey,
                        CancellationToken.None);

                    if (persistedOperation is not null)
                    {
                        persistedOperation.DriveKey = createdDriveKey.Value.Value;
                        await TryCompensateAsync(persistedOperation, CancellationToken.None);
                    }
                }
                catch (Exception recoveryException)
                {
                    logger.LogWarning(
                        recoveryException,
                        "无法立即补偿 Drive 创建操作 {IdempotencyKey}，将由恢复任务继续处理。",
                        operation.IdempotencyKey);
                }
            }

            ExceptionDispatchInfo.Capture(exception).Throw();
            throw;
        }

        var drive = await LoadRequiredDriveAsync(operation.DriveId, cancellationToken);
        return new CreateDriveResult(CreateDriveResultCode.Created, drive);
    }

    public async Task<DriveResponse?> GetAsync(
        DriveId driveId,
        CancellationToken cancellationToken)
    {
        var entity = await driveRepository.FindByIdAsync(
            driveId.Value,
            cancellationToken);

        if (entity is null)
        {
            return null;
        }

        var ownership = await driveOwnershipRepository.FindByIdAsync(
            driveId.Value,
            cancellationToken);
        return ownership is null ? null : ToResponse(entity, ownership);
    }

    public async Task<IReadOnlyList<DriveResponse>> ListAsync(
        CancellationToken cancellationToken)
    {
        var drives = await driveRepository.FindAllAsync(cancellationToken);
        var ownerships = await driveOwnershipRepository.FindAllAsync(cancellationToken);
        var ownershipByDriveId = ownerships.ToDictionary(
            ownership => ownership.DriveId);

        return drives
            .Where(drive => ownershipByDriveId.ContainsKey(drive.Id))
            .OrderBy(drive => drive.CreatedAt)
            .ThenBy(drive => drive.Id)
            .Select(drive => ToResponse(drive, ownershipByDriveId[drive.Id]))
            .ToArray();
    }

    internal async Task RecoverIncompleteCreationsAsync(CancellationToken cancellationToken)
    {
        var operations = await operationRepository.FindAllAsync(cancellationToken);
        var idempotencyKeys = operations
            .Where(operation =>
                operation.Status == DriveCreationOperationStatus.Pending ||
                operation.Status == DriveCreationOperationStatus.HyperDriveCreated ||
                operation.Status == DriveCreationOperationStatus.CompensationPending)
            .Select(operation => operation.IdempotencyKey)
            .ToArray();

        foreach (var idempotencyKey in idempotencyKeys)
        {
            try
            {
                await RecoverIncompleteCreationAsync(idempotencyKey, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "恢复 Drive 创建操作 {IdempotencyKey} 失败，将在下一轮重试。",
                    idempotencyKey);
            }
        }
    }

    private async Task RecoverIncompleteCreationAsync(
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        using var lease = await creationLock.AcquireAsync(idempotencyKey, cancellationToken);
        unitOfWork.ClearTrackedEntities();
        var operation = await operationRepository.FindByIdAsync(
            idempotencyKey,
            cancellationToken) ?? throw new InvalidOperationException(
                $"找不到 Drive 创建操作 {idempotencyKey}。");

        if (operation.Status == DriveCreationOperationStatus.Pending)
        {
            if (!DriveName.TryCreate(operation.Name, out var name))
            {
                throw new InvalidOperationException(
                    $"创建操作 {idempotencyKey} 保存了无效的 Drive Name。");
            }

            var driveKey = await hyperClient.CreateAsync(
                new DriveId(operation.DriveId),
                name,
                cancellationToken);
            operation.DriveKey = driveKey.Value;
            operation.Status = DriveCreationOperationStatus.HyperDriveCreated;
            operation.UpdatedAt = GetUtcNow();
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        if (operation.Status is DriveCreationOperationStatus.HyperDriveCreated or
            DriveCreationOperationStatus.CompensationPending)
        {
            await TryCompensateAsync(operation, cancellationToken);
        }
    }

    private async Task<DriveCreationOperationEntity> GetOrCreateOperationAsync(
        IdempotencyKey idempotencyKey,
        DriveName name,
        DriveContentTypeId contentTypeId,
        string requestHash,
        CancellationToken cancellationToken)
    {
        var existing = await operationRepository.FindByIdAsync(
            idempotencyKey.Value,
            cancellationToken);

        if (existing is not null)
        {
            return existing;
        }

        var now = GetUtcNow();
        var created = new DriveCreationOperationEntity
        {
            IdempotencyKey = idempotencyKey.Value,
            RequestHash = requestHash,
            DriveId = DriveId.New().Value,
            Name = name.Value,
            ContentTypeId = contentTypeId.Value,
            Status = DriveCreationOperationStatus.Pending,
            CreatedAt = now,
            UpdatedAt = now
        };
        operationRepository.Add(created);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return created;
    }

    private async Task<DriveKey> EnsureHyperDriveCreatedAsync(
        DriveCreationOperationEntity operation,
        DriveName name,
        CancellationToken cancellationToken)
    {
        if (operation.Status == DriveCreationOperationStatus.HyperDriveCreated &&
            DriveKey.TryCreate(operation.DriveKey, out var existingDriveKey))
        {
            return existingDriveKey;
        }

        var driveKey = await hyperClient.CreateAsync(
            new DriveId(operation.DriveId),
            name,
            cancellationToken);
        operation.DriveKey = driveKey.Value;
        operation.Status = DriveCreationOperationStatus.HyperDriveCreated;
        operation.UpdatedAt = GetUtcNow();
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return driveKey;
    }

    private async Task PersistCompletedDriveAsync(
        DriveCreationOperationEntity operation,
        DriveKey driveKey,
        CancellationToken cancellationToken)
    {
        var now = GetUtcNow();
        driveRepository.Add(new DriveEntity
        {
            Id = operation.DriveId,
            Key = driveKey.Value,
            Name = operation.Name,
            ContentTypeId = operation.ContentTypeId,
            CreatedAt = now,
            UpdatedAt = now
        });
        driveOwnershipRepository.Add(new DriveOwnershipEntity
        {
            DriveId = operation.DriveId
        });
        operation.Status = DriveCreationOperationStatus.Completed;
        operation.UpdatedAt = now;
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<bool> TryCompensateAsync(
        DriveCreationOperationEntity operation,
        CancellationToken cancellationToken)
    {
        if (!DriveKey.TryCreate(operation.DriveKey, out var driveKey))
        {
            return false;
        }

        operation.Status = DriveCreationOperationStatus.CompensationPending;
        operation.CompensationAttemptCount++;
        operation.UpdatedAt = GetUtcNow();

        try
        {
            await unitOfWork.SaveChangesAsync(cancellationToken);
            await hyperClient.DeleteAsync(driveKey, cancellationToken);
            operation.Status = DriveCreationOperationStatus.Compensated;
            operation.UpdatedAt = GetUtcNow();
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "补偿 Drive 创建操作 {IdempotencyKey} 失败，第 {AttemptCount} 次尝试未完成。",
                operation.IdempotencyKey,
                operation.CompensationAttemptCount);
            return false;
        }
    }

    private async Task<DriveResponse?> TryLoadCompletedDriveAsync(
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        var operation = await operationRepository.FindByIdAsync(
            idempotencyKey,
            cancellationToken);

        return operation?.Status != DriveCreationOperationStatus.Completed
            ? null
            : await GetAsync(new DriveId(operation.DriveId), cancellationToken);
    }

    private async Task<DriveResponse> LoadRequiredDriveAsync(
        Guid driveId,
        CancellationToken cancellationToken)
    {
        var drive = await GetAsync(new DriveId(driveId), cancellationToken);

        return drive ?? throw new InvalidOperationException(
            $"已完成的创建操作缺少 Drive {driveId:D}。");
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

    private static DriveResponse ToResponse(
        DriveEntity entity,
        DriveOwnershipEntity ownership)
    {
        if (!DriveKey.TryCreate(entity.Key, out var key) ||
            !DriveName.TryCreate(entity.Name, out var name) ||
            !DriveContentTypeId.TryCreate(entity.ContentTypeId, out var contentTypeId))
        {
            throw new InvalidOperationException($"Drive {entity.Id:D} 的持久化数据无效。");
        }

        return new DriveResponse(
            entity.Id,
            key.Value,
            name.Value,
            contentTypeId.Value,
            ownership.Remark,
            ToResponseValue(DriveRelationType.Ownership),
            entity.CreatedAt,
            entity.UpdatedAt);
    }

    private static string ToResponseValue(DriveRelationType relationType) => relationType switch
    {
        DriveRelationType.Ownership => "ownership",
        DriveRelationType.Subscription => "subscription",
        _ => throw new ArgumentOutOfRangeException(nameof(relationType))
    };

    private sealed record RequestIdentity(string Name, string ContentTypeId);
}
